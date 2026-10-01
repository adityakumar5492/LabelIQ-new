"""
nutrition_service.py

Deterministic nutrition-table extraction for LabelIQ.

Priority (highest first):

    1. Coordinate OCR rows      (row grouping from word boxes)
    2. TABLE-MODE OCR rows      (psm 6 text appended by main.py)
    3. Plain OCR rows           (psm 3 text)
    4. Groq                     (ONLY if the table could not be solved)

Core idea
---------
The old parser resolved every nutrient FIELD independently (label -> nearby
number, or "n-th number in the table").  When OCR damaged a label, a unit or a
decimal point, one field silently took a value from another row/column, and
Groq then filled the remaining holes with values from yet another place.

This version solves the TABLE as one coherent object:

    * every table row is parsed into (100g value, serving value, %RI)
    * OCR damage (g -> 9, lost decimal point, lost unit) is repaired by
      generating candidate readings and keeping only the ones that satisfy
      serving ~= per100g * serving_size/100
    * rows are matched to nutrients with an order-preserving alignment
      (EU/UK order: fat, saturates, carbohydrate, sugars, fibre, protein, salt)
      scored by label similarity AND by %RI arithmetic
      (e.g. 13.9 g sugars / 90 g reference = 15 %)
    * relationships (saturates <= fat, sugars <= carbohydrate, value <= serving
      size) are validated afterwards

Groq is never mixed into a table that was solved deterministically.
"""

import re
import logging
from difflib import SequenceMatcher
from typing import Optional, Any

import pytesseract
from PIL import Image, ImageOps, ImageStat


logger = logging.getLogger("labeliq.ai.nutrition")


# ============================================================
# SETTINGS
# ============================================================

# When the per-serving cell of a row is unreadable, allow
# serving = per100g * serving_size / 100, but ONLY when the printed %RI
# corroborates the derived number.
DERIVE_SERVING_FROM_REFERENCE = True

# Attach per-field provenance under the "_evidence" key of the result.
# Off by default so the extra key is not forwarded to the AI-insights prompt.
# Provenance is always written to the log.
INCLUDE_EVIDENCE = False

MIN_TABLE_FIELDS = 4          # solved fields required to call the table "strong"
MIN_ASSIGN_SCORE = 0.5        # minimum evidence to assign a row to a nutrient
PAIR_BONUS = 3.0              # reward for a (100g, serving) pair that obeys the ratio
PCT_TOLERANCE = 1.0           # allowed |computed %RI - printed %RI| in points
RATIO_REL_TOL = 0.10          # serving ~= per100g * ratio, relative tolerance
RATIO_ABS_TOL = 0.03          # tighter absolute tolerance for small values
MAX_REGION_LINES = 24

COORD_MIN_WIDTH = 1800
COORD_MAX_UPSCALE = 3.0
MIN_OCR_CONFIDENCE = 10
COORD_OCR_CONFIG = "--oem 3 --psm 6 -c preserve_interword_spaces=1"


# ============================================================
# NUTRITION FIELDS
# ============================================================

NUTRITION_FIELDS = [
    "calories",
    "protein_g",
    "carbohydrates_g",
    "total_fat_g",
    "saturated_fat_g",
    "dietary_fiber_g",
    "total_sugars_g",
    "added_sugars_g",
    "sodium_mg",
]

GRAM_FIELDS = [
    "protein_g",
    "carbohydrates_g",
    "total_fat_g",
    "saturated_fat_g",
    "dietary_fiber_g",
    "total_sugars_g",
    "added_sugars_g",
]

# NOTE: "sat" / "satt" were REMOVED from the saturated-fat aliases.
# On this label OCR reads "Salt" as "Sat", which used to be classified as
# saturated fat.  Salt handling has its own (guarded) detector below.
FIELD_ALIASES = {
    "calories": [
        "calories",
        "energy",
        "energy kcal",
        "kcal",
    ],
    "protein_g": [
        "protein",
    ],
    "carbohydrates_g": [
        "carbohydrate",
        "carbohydrates",
        "carbohydate",
        "carbohyéate",
        "carbohyate",
        "carbohydrat",
        "carbs",
    ],
    "total_fat_g": [
        "fat",
        "total fat",
        "total fats",
    ],
    "saturated_fat_g": [
        "saturates",
        "saturate",
        "saturated fat",
        "saturated fats",
    ],
    "dietary_fiber_g": [
        "fibre",
        "fiber",
        "dietary fibre",
        "dietary fiber",
    ],
    "total_sugars_g": [
        "sugars",
        "sugar",
        "total sugars",
        "total sugar",
    ],
    "added_sugars_g": [
        "added sugars",
        "added sugar",
    ],
    "sodium_mg": [
        "sodium",
    ],
}

FIELD_LIMITS = {
    "calories": 5000,
    "protein_g": 1000,
    "carbohydrates_g": 1000,
    "total_fat_g": 1000,
    "saturated_fat_g": 1000,
    "dietary_fiber_g": 1000,
    "total_sugars_g": 1000,
    "added_sugars_g": 1000,
    "sodium_mg": 40000,
}

# EU/UK reference intakes (grams per day; energy handled separately).
# Fibre has no reference intake, which is itself useful evidence.
REFERENCE_INTAKE = {
    "total_fat_g": 70.0,
    "saturated_fat_g": 20.0,
    "carbohydrates_g": 260.0,
    "total_sugars_g": 90.0,
    "protein_g": 50.0,
    "salt_g": 6.0,
}

ENERGY_REFERENCE_KCAL = 2000.0
ENERGY_REFERENCE_KJ = 8400.0

# Order mandated for EU/UK labels (Reg. 1169/2011).
TABLE_FIELD_ORDER = [
    "total_fat_g",
    "saturated_fat_g",
    "carbohydrates_g",
    "total_sugars_g",
    "dietary_fiber_g",
    "protein_g",
    "salt_g",
]


# ============================================================
# BASIC NORMALIZATION
# ============================================================

def normalize_text(value: str) -> str:
    if not value:
        return ""

    value = str(value).lower()

    replacements = {
        "ﬁ": "fi",
        "ﬂ": "fl",
        "é": "e",
        "è": "e",
        "ê": "e",
        "ë": "e",
        "—": "-",
        "–": "-",
    }

    for old, new in replacements.items():
        value = value.replace(old, new)

    value = re.sub(r"[^\w\s]", " ", value)
    value = re.sub(r"\s+", " ", value)

    return value.strip()


def compact_text(value: str) -> str:
    return re.sub(
        r"[^a-z0-9]",
        "",
        normalize_text(value),
    )


def normalize_number(value: Any) -> Optional[float]:
    if value is None:
        return None

    value = str(value).strip()

    if not value:
        return None

    value = value.replace(",", ".")

    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if number < 0:
        return None

    return round(number, 4)


# ============================================================
# FIELD DETECTION
# ============================================================

def detect_nutrition_field(text: str) -> Optional[str]:

    normalized = normalize_text(text)

    if not normalized:
        return None

    compact = compact_text(normalized)

    ordered_fields = [
        "added_sugars_g",
        "saturated_fat_g",
        "dietary_fiber_g",
        "total_sugars_g",
        "total_fat_g",
        "carbohydrates_g",
        "protein_g",
        "sodium_mg",
        "calories",
    ]

    for field in ordered_fields:

        for alias in FIELD_ALIASES[field]:

            alias_compact = compact_text(alias)

            if compact == alias_compact:
                return field

            if len(alias_compact) >= 5 and len(compact) >= 4:

                similarity = SequenceMatcher(
                    None,
                    compact,
                    alias_compact,
                ).ratio()

                if similarity >= 0.82:
                    return field

    return None


_SALT_WORDS = {"salt", "sait", "sa1t", "salr", "satt", "sat"}


def _is_salt_word(word: str) -> bool:
    return compact_text(word) in _SALT_WORDS


# ============================================================
# NUMBER EXTRACTION (generic helpers, kept for compatibility)
# ============================================================

NUMBER_RE = re.compile(
    r"(?<![\d.,])"
    r"(\d+(?:[.,]\d+)?)"
    r"(?!\d)"
)


def extract_numbers(text: str) -> list[float]:

    if not text:
        return []

    values = []

    for match in NUMBER_RE.finditer(text):

        end = match.end()

        if end < len(text):
            if text[end:].lstrip().startswith("%"):
                continue

        value = normalize_number(match.group(1))

        if value is not None:
            values.append(value)

    return values


def extract_percentage_values(text: str) -> list[float]:

    if not text:
        return []

    values = []

    for match in re.finditer(r"(\d+(?:[.,]\d+)?)\s*%", text):

        value = normalize_number(match.group(1))

        if value is not None:
            values.append(value)

    return values


# ============================================================
# ENERGY / SALT
# ============================================================

def kj_to_kcal(kj: float) -> float:
    return round(kj / 4.184, 2)


def salt_to_sodium_mg(salt_g: float) -> float:
    return round(salt_g * 400, 2)


# ============================================================
# VALIDATION
# ============================================================

def validate_value(
    field: str,
    value: Optional[float],
) -> Optional[float]:

    if value is None:
        return None

    if value < 0:
        return None

    limit = FIELD_LIMITS.get(field, 1000)

    if value > limit:
        logger.warning(
            "Rejected %s=%s: exceeds limit %s",
            field,
            value,
            limit,
        )
        return None

    return round(value, 2)


RELATIONSHIPS = [
    ("saturated_fat_g", "total_fat_g"),
    ("total_sugars_g", "carbohydrates_g"),
    ("added_sugars_g", "total_sugars_g"),
]


def validate_relationships(
    nutrition: dict,
    serving_grams: Optional[float] = None,
) -> dict:
    """
    Reject impossible combinations.

    * child nutrient may not exceed its parent
    * a per-serving gram value may not exceed the serving size itself
      (a 32 g bar cannot contain 42 g of sugars - that is the 100 g column)
    """

    if serving_grams:
        cap = serving_grams * 1.02 + 0.05

        for field in GRAM_FIELDS:
            value = nutrition.get(field)

            if value is not None and value > cap:
                logger.warning(
                    "Rejected %s=%s: larger than serving size %sg",
                    field,
                    value,
                    serving_grams,
                )
                nutrition[field] = None

    for child, parent in RELATIONSHIPS:

        child_value = nutrition.get(child)
        parent_value = nutrition.get(parent)

        if child_value is None or parent_value is None:
            continue

        if child_value > parent_value + 0.05:
            logger.warning(
                "Invalid nutrition relationship: %s=%s > %s=%s",
                child,
                child_value,
                parent,
                parent_value,
            )
            nutrition[child] = None

    return nutrition


# ============================================================
# EMPTY RESULT
# ============================================================

def empty_nutrition() -> dict:
    return {
        "serving_size": None,
        "calories": None,
        "protein_g": None,
        "carbohydrates_g": None,
        "total_fat_g": None,
        "saturated_fat_g": None,
        "dietary_fiber_g": None,
        "total_sugars_g": None,
        "added_sugars_g": None,
        "sodium_mg": None,
    }


# ============================================================
# SERVING SIZE
# ============================================================

SERVING_SIZE_RE = re.compile(
    r"""
    (?:
        serving\s+size
        |
        portion\s+size
        |
        serving
        |
        portion
    )
    [:\s]*
    (
        \d+(?:[.,]\d+)?
        \s*
        (?:g|kg|ml|l)
        (?:\s*\([^)]*\))?
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)


def extract_serving_size(text: str) -> Optional[str]:

    if not text:
        return None

    match = SERVING_SIZE_RE.search(text)

    if not match:
        return None

    return re.sub(r"\s+", " ", match.group(1)).strip()


def serving_size_to_grams(
    serving_size: Optional[str],
) -> Optional[float]:

    if not serving_size:
        return None

    match = re.search(
        r"(\d+(?:[.,]\d+)?)\s*g",
        serving_size.lower(),
    )

    if not match:
        return None

    return normalize_number(match.group(1))


# ============================================================
# TABLE ROW PARSING
# ============================================================

_PCT_RE = re.compile(r"\(?\s*(\d{1,3})\s*%\s*\)?")
_KJ_RE = re.compile(r"(\d[\d.,]*)\s*k\s*[jJ)]", re.IGNORECASE)
_KCAL_RE = re.compile(r"(\d[\d.,]*)\s*kcal", re.IGNORECASE)
_NUM_RE = re.compile(
    r"(?<![\w.,])(\d+(?:[.,]\d+)?)(?:\s?(mg|g))?(?![A-Za-z0-9])",
    re.IGNORECASE,
)
_WORD_RE = re.compile(r"[^\W\d_]{2,}")
_UNIT_WORDS = {"mg", "kg", "kj", "kcal", "ml"}
_END_MARKERS = ("referenceintake", "storein", "recycle", "freepost")


def _cell_candidates(
    raw: str,
    unit: Optional[str],
) -> list[tuple[float, float]]:
    """
    All plausible readings of one OCR numeric cell with a repair penalty.

    Typical OCR damage on nutrition tables:
        "5.0g"  -> "5.09"   (trailing g read as 9)
        "3.4g"  -> "34g"    (decimal point lost)
        "0.06g" -> "006g"   (decimal point lost)
        "13.9g" -> "139"    (both)
    """

    raw = raw.replace(",", ".")

    try:
        base_value = float(raw)
    except ValueError:
        return []

    found: dict[float, float] = {}

    def add(value: float, penalty: float) -> None:
        value = round(value, 4)
        if value < 0:
            return
        if value not in found or penalty < found[value]:
            found[value] = penalty

    base_penalty = 0.0 if unit else 0.05
    is_integer = "." not in raw

    add(base_value, base_penalty)

    # Lost decimal point.
    if is_integer and len(raw) >= 2:
        if raw.startswith("0"):
            add(float("0." + raw[1:]), base_penalty + 0.5)
        else:
            add(base_value / 10, base_penalty + 0.5)

    # Trailing "g" read as "9" (only when no unit was read).
    if not unit and raw.endswith("9") and len(raw) >= 2:

        stripped = raw[:-1]

        if stripped.endswith("."):
            stripped = stripped[:-1]

        try:
            stripped_value = float(stripped)
        except ValueError:
            stripped_value = None

        if stripped_value is not None:
            add(stripped_value, base_penalty + 0.4)

            if "." not in stripped and len(stripped) >= 2:
                if stripped.startswith("0"):
                    add(float("0." + stripped[1:]), base_penalty + 0.9)
                else:
                    add(stripped_value / 10, base_penalty + 0.9)

    return list(found.items())


def _label_field(words: list[str]) -> Optional[str]:

    if not words:
        return None

    for candidate in [" ".join(words)] + words:
        field = detect_nutrition_field(candidate)
        if field:
            return field

    return None


def _parse_line(line: str) -> Optional[dict]:
    """
    Parse one OCR line of a nutrition table.

    Returns {"kind": "energy", ...}, {"kind": "row", ...} or None.
    """

    if not line or not line.strip():
        return None

    pct_matches = _PCT_RE.findall(line)
    pct = int(pct_matches[-1]) if pct_matches else None

    text = _PCT_RE.sub(" ", line)

    kj_values = [
        v for v in (normalize_number(x) for x in _KJ_RE.findall(text))
        if v is not None
    ]
    kcal_values = [
        v for v in (normalize_number(x) for x in _KCAL_RE.findall(text))
        if v is not None
    ]

    if kj_values or kcal_values:
        return {
            "kind": "energy",
            "line": line,
            "kj": kj_values,
            "kcal": kcal_values,
            "pct": pct,
        }

    nums = []

    for match in _NUM_RE.finditer(text):

        raw = match.group(1)
        unit = (match.group(2) or "").lower() or None

        if unit == "mg":
            continue

        candidates = _cell_candidates(raw, unit)

        if candidates:
            nums.append({
                "raw": raw,
                "unit": unit,
                "cands": candidates,
            })

    if not nums:
        return None

    words = [
        w for w in _WORD_RE.findall(text)
        if w.lower() not in _UNIT_WORDS
    ]

    return {
        "kind": "row",
        "line": line,
        "pct": pct,
        "nums": nums[:4],
        "words": words,
        "label_field": _label_field(words),
        "salt_label": any(_is_salt_word(w) for w in words),
    }


# ============================================================
# TABLE REGION / HEADER
# ============================================================

_HEADER_RE = re.compile(r"nutrition\s*(?:information|facts)", re.IGNORECASE)


def _serving_from_header(header_rest: str) -> Optional[float]:
    """
    Header like "100g 32g": the value that is not ~100 is the serving.
    Ignored when OCR mangled the header ("1100g 132g").
    """

    values = [
        float(x)
        for x in re.findall(r"(\d+(?:\.\d+)?)\s*g", header_rest, re.IGNORECASE)
    ]

    if len(values) < 2:
        return None

    if not any(abs(v - 100) <= 3 for v in values):
        return None

    others = [v for v in values if abs(v - 100) > 3]

    return others[0] if others else None


def _find_region(lines: list[str]) -> Optional[dict]:

    start = None

    for index, line in enumerate(lines):
        if re.search(r"nutrition", line, re.IGNORECASE) and (
            "nutritioninformation" in compact_text(line)
            or "nutritionfacts" in compact_text(line)
        ):
            start = index
            break

    if start is None:
        return None

    header_match = _HEADER_RE.search(lines[start])
    header_rest = lines[start][header_match.end():] if header_match else ""

    region = []

    for line in lines[start + 1: start + 1 + MAX_REGION_LINES]:

        compact = compact_text(line)

        if any(marker in compact for marker in _END_MARKERS):
            break

        region.append(line)

    return {
        "lines": region,
        "header_serving_g": _serving_from_header(header_rest),
    }


# ============================================================
# HYPOTHESES + SCORING
# ============================================================

def _row_hypotheses(
    row: dict,
    ratio: Optional[float],
    serving_g: Optional[float],
) -> list[dict]:
    """
    Every consistent reading of a row:
        pair    - (100g, serving) both present and obeying the ratio
        ref     - only the 100g cell survived
        serving - only the serving cell survived
    """

    max_serving = serving_g * 1.02 + 0.05 if serving_g else 100.0

    nums = row["nums"]
    hypotheses = []

    for number in nums:
        for value, penalty in number["cands"]:
            if value <= 100:
                hypotheses.append({
                    "kind": "ref", "v100": value,
                    "vserv": None, "pen": penalty,
                })
            if value <= max_serving:
                hypotheses.append({
                    "kind": "serving", "v100": None,
                    "vserv": value, "pen": penalty,
                })

    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            for a, pa in nums[i]["cands"]:

                if a > 100:
                    continue

                for b, pb in nums[j]["cands"]:

                    if b > max_serving:
                        continue

                    if ratio:
                        expected = a * ratio
                        tolerance = max(
                            RATIO_REL_TOL * expected,
                            RATIO_ABS_TOL,
                        )
                        if abs(b - expected) > tolerance:
                            continue

                    hypotheses.append({
                        "kind": "pair", "v100": a,
                        "vserv": b, "pen": pa + pb,
                    })

    return hypotheses


def _evaluate(
    hypothesis: dict,
    field: str,
    row: dict,
    ratio: Optional[float],
) -> tuple[float, float, Optional[float]]:
    """
    Returns (identity_score, value_quality, pct_error).

    value_quality judges how good the NUMBERS are.
    identity_score additionally rewards/penalises the row label, and is used
    only to decide which nutrient a row is.
    """

    quality = -hypothesis["pen"]

    if hypothesis["kind"] == "pair":
        quality += PAIR_BONUS

    serving_value = hypothesis["vserv"]
    derived = False

    if (
        serving_value is None
        and hypothesis["v100"] is not None
        and ratio
    ):
        serving_value = hypothesis["v100"] * ratio
        derived = True

    if hypothesis["kind"] == "ref" and not ratio:
        quality -= 1.0

    pct = row["pct"]
    pct_error = None
    reference = REFERENCE_INTAKE.get(field)

    if reference is not None:

        if pct is None:
            quality -= 0.7

        elif serving_value is not None:

            pct_error = abs(serving_value / reference * 100.0 - pct)
            # Printed %RI values are commonly rounded to whole percentages.
            # They are corroborating evidence, not stronger evidence than an
            # actual OCR cell. Keep their influence bounded so %RI arithmetic
            # cannot manufacture a value that beats a clearly read cell.
            weight = 1.2 if derived else 1.5

            if pct_error <= PCT_TOLERANCE:
                quality += 0.5 + weight * (1.0 - pct_error)
            elif pct_error <= 2.5:
                quality -= 0.5
            else:
                quality -= 2.0
        else:
            quality -= 1.0

    else:
        # Fibre: labels normally print no %RI for it.
        quality += -2.5 if pct is not None else 1.0

    identity = quality

    label_field = row["label_field"]

    if label_field:
        identity += 4.0 if label_field == field else -5.0

    if field == "salt_g" and row["salt_label"]:
        identity += 3.0

    if (
        field == "saturated_fat_g"
        and row["salt_label"]
        and not label_field
    ):
        identity -= 2.0

    return identity, quality, pct_error


def _align_rows(
    rows: list[dict],
    ratio: Optional[float],
    serving_g: Optional[float],
) -> dict[str, dict]:
    """
    Order-preserving assignment of table rows to nutrients (dynamic
    programming).  Unreadable rows and missing nutrients are simply skipped.
    """

    n = len(rows)
    m = len(TABLE_FIELD_ORDER)

    scores: list[list[Optional[dict]]] = [[None] * m for _ in range(n)]

    for i, row in enumerate(rows):

        hypotheses = _row_hypotheses(row, ratio, serving_g)

        for j, field in enumerate(TABLE_FIELD_ORDER):

            best = None

            for hypothesis in hypotheses:

                identity, quality, pct_error = _evaluate(
                    hypothesis, field, row, ratio,
                )

                if best is None or identity > best["identity"]:
                    best = {
                        "identity": identity,
                        "quality": quality,
                        "pct_error": pct_error,
                        "hyp": hypothesis,
                        "row": row,
                    }

            if best and best["identity"] >= MIN_ASSIGN_SCORE:
                scores[i][j] = best

    dp = [[0.0] * (m + 1) for _ in range(n + 1)]
    move = [[None] * (m + 1) for _ in range(n + 1)]

    for i in range(1, n + 1):
        for j in range(1, m + 1):

            best_value = dp[i - 1][j]
            best_move = "row"

            if dp[i][j - 1] > best_value:
                best_value = dp[i][j - 1]
                best_move = "field"

            cell = scores[i - 1][j - 1]

            if cell and dp[i - 1][j - 1] + cell["identity"] > best_value:
                best_value = dp[i - 1][j - 1] + cell["identity"]
                best_move = "match"

            dp[i][j] = best_value
            move[i][j] = best_move

    assignment: dict[str, dict] = {}

    i, j = n, m

    while i > 0 and j > 0:

        step = move[i][j]

        if step == "match":
            assignment[TABLE_FIELD_ORDER[j - 1]] = scores[i - 1][j - 1]
            i -= 1
            j -= 1
        elif step == "row":
            i -= 1
        else:
            j -= 1

    return assignment


# ============================================================
# ONE OCR SOURCE -> TABLE
# ============================================================

def _extract_source(
    name: str,
    lines: list[str],
    serving_g: Optional[float],
) -> Optional[dict]:

    region = _find_region(lines)

    if region is None:
        return None

    effective_serving = serving_g or region["header_serving_g"]
    ratio = effective_serving / 100.0 if effective_serving else None

    rows = []
    energy = []

    for line in region["lines"]:

        parsed = _parse_line(line)

        if parsed is None:
            continue

        if parsed["kind"] == "energy":
            energy.append(parsed)
        else:
            rows.append(parsed)

    assignment = _align_rows(rows, ratio, effective_serving)

    logger.info(
        "Nutrition source %s: %s rows, %s energy lines, assigned=%s",
        name,
        len(rows),
        len(energy),
        sorted(assignment),
    )

    return {
        "name": name,
        "rows": rows,
        "energy": energy,
        "assignment": assignment,
        "header_serving_g": region["header_serving_g"],
        "ratio": ratio,
    }


# ============================================================
# FINALISE ONE FIELD
# ============================================================

def _finalize_selection(
    field: str,
    selection: dict,
    ratio: Optional[float],
) -> Optional[dict]:
    """
    Turn a chosen hypothesis into a value, or reject it.
    """

    hypothesis = selection["hyp"]
    row = selection["row"]
    reference = REFERENCE_INTAKE.get(field)
    corroborated = (
        selection["pct_error"] is not None
        and selection["pct_error"] <= PCT_TOLERANCE
    )

    if hypothesis["vserv"] is not None:

        if hypothesis["kind"] == "serving":
            # A lone serving cell has no second column to check the ratio
            # against, so it must be corroborated by the printed %RI.
            if reference is None or not corroborated:
                return None

        return {
            "value": hypothesis["vserv"],
            "method": (
                "table_pair"
                if hypothesis["kind"] == "pair"
                else "serving_cell_pct_checked"
            ),
            "has_reading": True,
        }

    if (
        DERIVE_SERVING_FROM_REFERENCE
        and hypothesis["v100"] is not None
        and ratio
        and reference is not None
        and corroborated
    ):
        return {
            "value": round(hypothesis["v100"] * ratio, 2),
            "method": "derived_from_100g_pct_checked",
            "has_reading": False,
        }

    return None


# ============================================================
# ENERGY
# ============================================================

def _solve_energy(
    energy_rows: list[dict],
    ratio: Optional[float],
) -> tuple[Optional[float], Optional[str]]:

    kj_values = []
    kcal_values = []
    percentages = []

    for row in energy_rows:
        kj_values += row["kj"]
        kcal_values += row["kcal"]
        if row["pct"] is not None:
            percentages.append(row["pct"])

    serving_kj = None

    if ratio:
        for a in kj_values:
            for b in kj_values:
                if a > b and abs(b - a * ratio) <= 0.05 * a * ratio:
                    serving_kj = b

    if serving_kj is None:
        for kj in kj_values:
            for pct in percentages:
                if abs(kj / ENERGY_REFERENCE_KJ * 100 - pct) <= PCT_TOLERANCE:
                    serving_kj = kj

    best = None
    best_score = 0

    for kcal in kcal_values:

        score = 0

        if serving_kj and abs(kcal - serving_kj / 4.184) <= 0.05 * kcal:
            score += 2

        if any(
            abs(kcal / ENERGY_REFERENCE_KCAL * 100 - pct) <= PCT_TOLERANCE
            for pct in percentages
        ):
            score += 1

        if score > best_score:
            best, best_score = kcal, score

    if best is not None:
        return best, "kcal_cell_cross_checked"

    if ratio and len(kcal_values) >= 2:
        for a in kcal_values:
            for b in kcal_values:
                if a > b and abs(b - a * ratio) <= 0.05 * a * ratio:
                    return b, "kcal_pair_ratio"

    if serving_kj:
        return round(serving_kj / 4.184), "derived_from_serving_kj"

    return None, None


# ============================================================
# COORDINATE OCR (row grouping from word boxes)
# ============================================================

def _safe_int(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _safe_confidence(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _prepare_for_coordinate_ocr(image: Image.Image) -> Image.Image:
    """
    The image handed over by main.py is the raw upload.  Give Tesseract the
    same kind of input the text passes get: grayscale, upscaled, contrast
    stretched.
    """

    gray = ImageOps.grayscale(image)

    width, height = gray.size

    if 0 < width < COORD_MIN_WIDTH:
        scale = min(COORD_MIN_WIDTH / width, COORD_MAX_UPSCALE)
        resampling = getattr(Image, "Resampling", Image)
        gray = gray.resize(
            (round(width * scale), round(height * scale)),
            resampling.LANCZOS,
        )

    if ImageStat.Stat(gray).mean[0] < 110:
        gray = ImageOps.invert(gray)

    return ImageOps.autocontrast(gray, cutoff=1)


def _build_coordinate_tokens(image: Image.Image) -> list[dict]:

    if image is None:
        return []

    prepared = _prepare_for_coordinate_ocr(image)

    try:
        data = pytesseract.image_to_data(
            prepared,
            config=COORD_OCR_CONFIG,
            output_type=pytesseract.Output.DICT,
        )
    except Exception as error:
        logger.warning("Coordinate OCR failed: %s", error)
        return []

    tokens = []

    for index in range(len(data.get("text", []))):

        text = (data["text"][index] or "").strip()

        if not text:
            continue

        confidence = _safe_confidence(data["conf"][index])

        if confidence < MIN_OCR_CONFIDENCE:
            continue

        left = _safe_int(data["left"][index])
        top = _safe_int(data["top"][index])
        width = _safe_int(data["width"][index])
        height = _safe_int(data["height"][index])

        tokens.append({
            "text": text,
            "left": left,
            "right": left + width,
            "top": top,
            "height": height,
            "center_y": top + height / 2,
            "confidence": confidence,
        })

    return tokens


def _median(values: list[float]) -> float:

    ordered = sorted(values)
    count = len(ordered)

    if not count:
        return 0.0

    if count % 2:
        return ordered[count // 2]

    return (ordered[count // 2 - 1] + ordered[count // 2]) / 2


def _coordinate_lines(image: Optional[Image.Image]) -> list[str]:
    """
    Group word boxes into visual rows.  The row tolerance is relative to the
    text height (not a fixed pixel count), and cells that are far apart are
    separated with " | " so columns stay separate.
    """

    tokens = _build_coordinate_tokens(image)

    if not tokens:
        return []

    median_height = max(_median([t["height"] for t in tokens]), 1.0)
    tolerance = 0.6 * median_height

    tokens.sort(key=lambda t: t["center_y"])

    rows: list[list[dict]] = []
    row_center = 0.0

    for token in tokens:

        if rows and abs(token["center_y"] - row_center) <= tolerance:
            rows[-1].append(token)
            row_center = sum(t["center_y"] for t in rows[-1]) / len(rows[-1])
        else:
            rows.append([token])
            row_center = token["center_y"]

    lines = []

    for row in rows:

        row.sort(key=lambda t: t["left"])

        parts = [row[0]["text"]]

        for previous, current in zip(row, row[1:]):

            gap = current["left"] - previous["right"]
            separator = " | " if gap > 1.5 * median_height else " "
            parts.append(separator + current["text"])

        lines.append("".join(parts))

    return lines


def extract_coordinate_nutrition(
    image: Optional[Image.Image],
    serving_size: Optional[str] = None,
) -> dict:
    """
    Public helper: solve the table using coordinate OCR rows only.
    """

    nutrition = empty_nutrition()

    if image is None:
        return nutrition

    serving_g = serving_size_to_grams(serving_size)

    solved = _solve_table(
        [("coordinate_ocr", _coordinate_lines(image))],
        serving_g,
    )

    for field, item in solved["values"].items():
        nutrition[field] = item["value"]

    nutrition["serving_size"] = serving_size

    return validate_relationships(nutrition, serving_g)


# ============================================================
# SOLVE TABLE ACROSS OCR SOURCES
# ============================================================

def _solve_table(
    sources: list[tuple[str, list[str]]],
    serving_g: Optional[float],
) -> dict:
    """
    sources are in priority order (coordinate, table-mode, plain).
    Each source is solved on its own, then the best-evidenced reading per
    nutrient is selected across sources.
    """

    extracted = []

    for name, lines in sources:
        if not lines:
            continue
        result = _extract_source(name, lines, serving_g)
        if result:
            extracted.append(result)

    if serving_g is None:
        for result in extracted:
            if result["header_serving_g"]:
                serving_g = result["header_serving_g"]
                break

    ratio = serving_g / 100.0 if serving_g else None

    if serving_g and any(r["ratio"] != ratio for r in extracted):
        extracted = [
            r for r in (
                _extract_source(name, lines, serving_g)
                for name, lines in sources if lines
            ) if r
        ]

    values: dict[str, dict] = {}

    for field in TABLE_FIELD_ORDER:

        options = []

        for priority, result in enumerate(extracted):

            selection = result["assignment"].get(field)

            if not selection:
                continue

            final = _finalize_selection(field, selection, ratio)

            if not final:
                continue

            if field == "salt_g":
                # Sodium is derived from salt ONLY for an explicit salt row:
                # either the label reads as salt, or the printed %RI matches
                # the 6 g salt reference intake.
                row = selection["row"]
                corroborated = (
                    selection["pct_error"] is not None
                    and selection["pct_error"] <= PCT_TOLERANCE
                )
                if not (row["salt_label"] or corroborated):
                    continue
                if final["value"] > 20:
                    continue

            options.append({
                **final,
                "source": result["name"],
                "row_text": selection["row"]["line"],
                "quality": selection["quality"],
                "priority": priority,
            })

        if not options:
            continue

        options.sort(
            key=lambda o: (
                not o["has_reading"],
                -o["quality"],
                o["priority"],
            )
        )

        # Independent OCR sources agreeing on the same value are useful
        # corroboration. Give that agreement a small bounded bonus, without
        # allowing it to override a materially better direct reading.
        for option in options:
            if option["has_reading"]:
                agreement_count = sum(
                    1
                    for other in options
                    if other["has_reading"]
                    and abs(other["value"] - option["value"])
                    <= max(0.05, 0.01 * max(option["value"], 1.0))
                )
                option["quality"] += min(1.0, 0.35 * (agreement_count - 1))

        options.sort(
            key=lambda o: (
                not o["has_reading"],
                -o["quality"],
                o["priority"],
            )
        )

        chosen = options[0]

        for other in options[1:]:
            if (
                other["has_reading"]
                and chosen["has_reading"]
                and abs(other["value"] - chosen["value"])
                > 0.15 * max(chosen["value"], 0.1)
            ):
                logger.warning(
                    "Nutrition sources disagree for %s: %s=%s vs %s=%s",
                    field,
                    chosen["source"], chosen["value"],
                    other["source"], other["value"],
                )

        values[field] = chosen

    energy_rows = []

    for result in extracted:
        energy_rows += result["energy"]

    calories, calories_method = _solve_energy(energy_rows, ratio)

    return {
        "values": values,
        "calories": calories,
        "calories_method": calories_method,
        "serving_g": serving_g,
        "sources": [r["name"] for r in extracted],
        "region_lines": [
            row["line"] for r in extracted for row in r["rows"]
        ],
    }


# ============================================================
# LINE-BASED EXTRACTION (weak fallback only)
# ============================================================

PAIRED_VALUE_RE = re.compile(
    r"""
    (?P<first>\d+(?:[.,]\d+)?)
    \s*
    (?P<first_unit>g|mg|kcal|kj)?
    \s*
    (?:\||/|\\)
    \s*
    (?P<second>\d+(?:[.,]\d+)?)
    \s*
    (?P<second_unit>g|mg|kcal|kj)?
    """,
    re.IGNORECASE | re.VERBOSE,
)


def _extract_line_values(line: str) -> list[dict]:

    results = []

    for match in PAIRED_VALUE_RE.finditer(line):

        first = normalize_number(match.group("first"))
        second = normalize_number(match.group("second"))

        if first is None or second is None:
            continue

        results.append({
            "first": first,
            "first_unit": (match.group("first_unit") or "").lower(),
            "second": second,
            "second_unit": (match.group("second_unit") or "").lower(),
        })

    return results


def extract_line_based_nutrition(ocr_text: str) -> dict:
    """
    Very conservative label-on-the-same-line extraction.  Only used when the
    table solver could not produce a strong result.
    """

    nutrition = empty_nutrition()

    if not ocr_text:
        return nutrition

    for line in ocr_text.splitlines():

        normalized = normalize_text(line)

        if not normalized:
            continue

        field = detect_nutrition_field(normalized)

        if field is None:
            continue

        pairs = _extract_line_values(line)

        if pairs:

            pair = pairs[0]
            value = pair["second"]
            unit = pair["second_unit"]

            if field == "calories":
                if unit == "kcal":
                    nutrition[field] = validate_value(field, value)

            elif field == "sodium_mg":
                if unit == "mg":
                    nutrition[field] = validate_value(field, value)
                elif unit == "g":
                    nutrition[field] = validate_value(field, value * 1000)

            elif unit == "g":
                nutrition[field] = validate_value(field, value)

            continue

        numbers = extract_numbers(line)

        percentage_values = set(extract_percentage_values(line))

        numbers = [v for v in numbers if v not in percentage_values]

        if not numbers:
            continue

        value = numbers[-1]

        if field == "calories":
            if "kcal" in normalized:
                nutrition[field] = validate_value(field, value)
            elif "kj" in normalized:
                nutrition[field] = validate_value(field, kj_to_kcal(value))
            continue

        if field == "sodium_mg":
            if "mg" in normalized:
                nutrition[field] = validate_value(field, value)
            continue

        if re.search(r"\bg\b", normalized):
            nutrition[field] = validate_value(field, value)

    return validate_relationships(nutrition)


# ============================================================
# GROQ FALLBACK
# ============================================================

def _observed_values(text: str) -> set[float]:
    """
    Every numeric reading (including OCR repairs) present in the text.
    A Groq value that matches none of them was not read from the label.
    """

    observed: set[float] = set()

    for match in _NUM_RE.finditer(_PCT_RE.sub(" ", text or "")):
        unit = (match.group(2) or "").lower() or None
        for value, _ in _cell_candidates(match.group(1), unit):
            observed.add(round(value, 2))

    for match in _KJ_RE.finditer(text or ""):
        value = normalize_number(match.group(1))
        if value:
            observed.add(round(value / 4.184, 0))

    return observed


def _fill_from_groq(
    base: dict,
    groq_nutrition: dict,
    observed: set[float],
) -> dict:
    """
    Groq may only fill fields that are still empty, only with values that
    exist in the OCR text, and never a child nutrient without a parent that
    can be checked.
    """

    if not isinstance(groq_nutrition, dict):
        return base

    parent_of = {child: parent for child, parent in RELATIONSHIPS}

    for field in NUTRITION_FIELDS:

        if base.get(field) is not None:
            continue

        value = validate_value(field, groq_nutrition.get(field))

        if value is None:
            continue

        if round(value, 2) not in observed:
            logger.warning(
                "Rejected Groq %s=%s: value not present in OCR text",
                field, value,
            )
            continue

        parent = parent_of.get(field)

        if parent and base.get(parent) is None:
            logger.warning(
                "Rejected Groq %s=%s: parent %s unavailable to verify it",
                field, value, parent,
            )
            continue

        base[field] = value

    return base


def merge_nutrition(
    groq_nutrition: dict,
    deterministic_nutrition: dict,
    coordinate_nutrition: Optional[dict] = None,
) -> dict:
    """
    Kept for compatibility.  Deterministic sources win; Groq only fills gaps.
    """

    result = empty_nutrition()

    deterministic_nutrition = deterministic_nutrition or {}
    coordinate_nutrition = coordinate_nutrition or {}
    groq_nutrition = groq_nutrition if isinstance(groq_nutrition, dict) else {}

    result["serving_size"] = (
        coordinate_nutrition.get("serving_size")
        or deterministic_nutrition.get("serving_size")
        or groq_nutrition.get("serving_size")
    )

    for field in NUTRITION_FIELDS:

        for source in (
            coordinate_nutrition,
            deterministic_nutrition,
            groq_nutrition,
        ):
            value = validate_value(field, source.get(field))
            if value is not None:
                result[field] = value
                break

    return validate_relationships(
        result,
        serving_size_to_grams(result["serving_size"]),
    )


# ============================================================
# OCR TEXT SPLITTING
# ============================================================

_TABLE_MARKER = "[TABLE-MODE OCR"


def _split_ocr_text(ocr_text: str) -> tuple[str, str]:

    if _TABLE_MARKER in ocr_text:
        general, table = ocr_text.split(_TABLE_MARKER, 1)
        return general, table

    return ocr_text, ""


# ============================================================
# MAIN PROCESSOR
# ============================================================

def process_nutrition(
    image: Optional[Image.Image],
    ocr_text: str,
    groq_nutrition: Optional[dict] = None,
) -> dict:

    try:
        return _process_nutrition(image, ocr_text, groq_nutrition)
    except Exception as error:
        logger.exception("Nutrition processing failed: %s", error)
        result = empty_nutrition()
        result["serving_size"] = extract_serving_size(ocr_text or "")
        return result


def _process_nutrition(
    image: Optional[Image.Image],
    ocr_text: str,
    groq_nutrition: Optional[dict],
) -> dict:

    ocr_text = ocr_text or ""

    # --------------------------------------------------------
    # 1. Serving size
    # --------------------------------------------------------

    serving_size = extract_serving_size(ocr_text)
    serving_g = serving_size_to_grams(serving_size)

    # --------------------------------------------------------
    # 2. Table solving: coordinate > table-mode > plain OCR
    # --------------------------------------------------------

    general_text, table_text = _split_ocr_text(ocr_text)

    sources: list[tuple[str, list[str]]] = []

    if image is not None:
        try:
            sources.append(("coordinate_ocr", _coordinate_lines(image)))
        except Exception as error:
            logger.warning("Coordinate OCR stage failed: %s", error)

    if table_text:
        sources.append(("table_mode_ocr", table_text.splitlines()))

    sources.append(("plain_ocr", general_text.splitlines()))

    solved = _solve_table(sources, serving_g)

    if serving_size is None and solved["serving_g"]:
        serving_size = f"{solved['serving_g']:g}g"
        serving_g = solved["serving_g"]

    result = empty_nutrition()
    result["serving_size"] = serving_size

    evidence: dict[str, dict] = {}

    for field, item in solved["values"].items():

        if field == "salt_g":
            result["sodium_mg"] = salt_to_sodium_mg(item["value"])
            evidence["sodium_mg"] = {
                "value": result["sodium_mg"],
                "salt_g": item["value"],
                "method": item["method"] + "+salt_to_sodium",
                "source": item["source"],
                "row": item["row_text"],
            }
        else:
            result[field] = item["value"]
            evidence[field] = {
                "value": item["value"],
                "method": item["method"],
                "source": item["source"],
                "row": item["row_text"],
            }

    if solved["calories"] is not None:
        result["calories"] = solved["calories"]
        evidence["calories"] = {
            "value": solved["calories"],
            "method": solved["calories_method"],
        }

    table_fields = len(solved["values"])
    strong = table_fields >= MIN_TABLE_FIELDS

    # --------------------------------------------------------
    # 3. Weak table: line-based fill, then guarded Groq fallback
    # --------------------------------------------------------

    if not strong:

        logger.info(
            "Table solve weak (%s fields) - using line-based + Groq fallback",
            table_fields,
        )

        line_based = extract_line_based_nutrition(ocr_text)

        for field in NUTRITION_FIELDS:
            if result[field] is None and line_based.get(field) is not None:
                result[field] = line_based[field]
                evidence[field] = {
                    "value": line_based[field],
                    "method": "line_based",
                }

        before = {f: result[f] for f in NUTRITION_FIELDS}

        result = _fill_from_groq(
            result,
            groq_nutrition or {},
            _observed_values(
                "\n".join(solved["region_lines"]) or ocr_text
            ),
        )

        for field in NUTRITION_FIELDS:
            if before[field] is None and result[field] is not None:
                evidence[field] = {
                    "value": result[field],
                    "method": "groq_fallback_grounded",
                }

    # --------------------------------------------------------
    # 4. Final validation
    # --------------------------------------------------------

    result = validate_relationships(result, serving_g)

    for field in list(evidence):
        if result.get(field) is None:
            evidence.pop(field)

    logger.info("Final nutrition result: %s", result)
    logger.info("Nutrition evidence: %s", evidence)

    if INCLUDE_EVIDENCE:
        result["_evidence"] = evidence

    return result