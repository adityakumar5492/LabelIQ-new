import logging
import re

from app.rag.retriever import search_knowledge


# ---------------------------------------------------------
# Logging
# ---------------------------------------------------------

logger = logging.getLogger("labeliq.ai.rag")


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

# Vector distance threshold.
#
# Lower distance = better semantic match.
# Exact/alias matches in the current knowledge base are around 0.
#
# We intentionally use a strict threshold so unrelated ingredients
# do not receive evidence just because they are semantically similar.
MAX_VECTOR_DISTANCE = 0.75


# ---------------------------------------------------------
# Ingredient aliases
# ---------------------------------------------------------
#
# These are deterministic aliases.
# They are NOT semantic guesses.
#
# Example:
# MSG -> E621
# Monosodium glutamate -> E621
#
# If an ingredient is not listed here, vector similarity alone
# must pass the strict distance threshold.
#

INGREDIENT_ALIASES = {
    "e621": "e621",
    "621": "e621",
    "msg": "e621",
    "monosodium glutamate": "e621",

    "e320": "e320",
    "bha": "e320",

    "maltodextrin": "maltodextrin",

    "palm oil": "palm oil",
}


# ---------------------------------------------------------
# Text normalization
# ---------------------------------------------------------

def normalize_ingredient(value: str) -> str:
    """
    Normalize ingredient text so small formatting differences
    do not affect matching.
    """

    if not value:
        return ""

    value = str(value).strip().lower()

    # Normalize common punctuation/separators.
    value = value.replace("_", " ")
    value = value.replace("-", " ")

    # Remove unnecessary punctuation.
    value = re.sub(r"[^\w\s]", " ", value)

    # Collapse multiple spaces.
    value = re.sub(r"\s+", " ", value)

    return value.strip()


# ---------------------------------------------------------
# Alias resolution
# ---------------------------------------------------------

def get_canonical_ingredient(ingredient: str) -> str:
    """
    Convert a known ingredient alias into its canonical name.

    Unknown ingredients are returned in normalized form.
    """

    normalized = normalize_ingredient(ingredient)

    return INGREDIENT_ALIASES.get(
        normalized,
        normalized
    )


# ---------------------------------------------------------
# URL cleanup
# ---------------------------------------------------------

def clean_source_url(url):
    """
    Ensure API returns a clean URL instead of Markdown.

    Example:

        [https://example.com](https://example.com)

    becomes:

        https://example.com
    """

    if not url:
        return None

    url = str(url).strip()

    markdown_match = re.match(
        r"^\[.*?\]\((https?://[^)]+)\)$",
        url
    )

    if markdown_match:
        return markdown_match.group(1)

    return url


# ---------------------------------------------------------
# Result validation
# ---------------------------------------------------------

def is_valid_result(
    result: dict,
    requested_ingredient: str,
    canonical_ingredient: str
) -> bool:
    """
    Decide whether a retrieved vector result is trustworthy enough
    to expose as evidence.

    Checks:

    1. Result must contain metadata.
    2. Distance must exist and be numeric.
    3. Distance must be below the strict threshold.
    4. Retrieved ingredient must resolve to the same canonical
       ingredient as the requested ingredient.
    """

    if not isinstance(result, dict):
        return False

    metadata = result.get("metadata") or {}

    distance = result.get("distance")

    if distance is None:
        return False

    try:
        distance = float(distance)
    except (TypeError, ValueError):
        return False

    if distance > MAX_VECTOR_DISTANCE:
        return False

    retrieved_ingredient = normalize_ingredient(
        metadata.get("ingredient", "")
    )

    if not retrieved_ingredient:
        return False

    retrieved_canonical = get_canonical_ingredient(
        retrieved_ingredient
    )

    if canonical_ingredient != retrieved_canonical:
        return False

    return True


# ---------------------------------------------------------
# Main public function
# ---------------------------------------------------------

def get_ingredient_evidence(
    ingredient: str
):
    """
    Retrieve trustworthy evidence for a single ingredient.

    Returning [] is intentional.

    For a health-related label analysis system, no evidence is
    safer than incorrect evidence.
    """

    if not ingredient:
        return []

    normalized_ingredient = normalize_ingredient(
        ingredient
    )

    if not normalized_ingredient:
        return []

    canonical_ingredient = get_canonical_ingredient(
        normalized_ingredient
    )

    try:
        results = search_knowledge(
            normalized_ingredient,
            top_k=5
        )
    except Exception as exc:
        # RAG failure should never crash the complete scan.
        # Log the failure so it is diagnosable instead of silently
        # looking like a legitimate "no evidence" result.
        logger.exception(
            "RAG search failed for ingredient=%r canonical=%r: %s",
            normalized_ingredient,
            canonical_ingredient,
            exc
        )
        return []

    if not results:
        logger.info(
            "RAG returned no candidates for ingredient=%r canonical=%r",
            normalized_ingredient,
            canonical_ingredient
        )
        return []

    evidence = []
    rejected_count = 0

    for result in results:

        if not is_valid_result(
            result,
            normalized_ingredient,
            canonical_ingredient
        ):
            rejected_count += 1
            continue

        metadata = result.get("metadata") or {}

        distance = result.get("distance")

        try:
            distance = float(distance)
        except (TypeError, ValueError):
            rejected_count += 1
            continue

        evidence.append({
            "ingredient": metadata.get(
                "ingredient"
            ),
            "source_name": metadata.get(
                "source_name"
            ),
            "source_url": clean_source_url(
                metadata.get("source_url")
            ),
            "evidence": result.get(
                "document",
                ""
            ),
            "distance": distance
        })

    # -----------------------------------------------------
    # Remove duplicate evidence
    # -----------------------------------------------------

    unique_evidence = []
    seen = set()

    for item in evidence:

        key = (
            normalize_ingredient(
                item.get("ingredient", "")
            ),
            item.get("source_name"),
            item.get("source_url")
        )

        if key in seen:
            continue

        seen.add(key)
        unique_evidence.append(item)

    # -----------------------------------------------------
    # Best matches first
    # -----------------------------------------------------

    unique_evidence.sort(
        key=lambda item: item["distance"]
    )

    if not unique_evidence:
        logger.info(
            "RAG candidates rejected for ingredient=%r canonical=%r "
            "candidates=%d rejected=%d",
            normalized_ingredient,
            canonical_ingredient,
            len(results),
            rejected_count
        )
    else:
        logger.info(
            "RAG evidence accepted for ingredient=%r canonical=%r "
            "accepted=%d nearest_distance=%.4f",
            normalized_ingredient,
            canonical_ingredient,
            len(unique_evidence),
            unique_evidence[0]["distance"]
        )

    return unique_evidence
