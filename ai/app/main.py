import os
import io
import re
import json
import logging

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.concurrency import run_in_threadpool

from PIL import (
    Image,
    ImageOps,
    ImageFilter,
    ImageStat,
)

import pytesseract

from dotenv import load_dotenv

import groq
from groq import Groq

from app.services.rag_service import get_ingredient_evidence
from app.services.nutrition_service import process_nutrition


# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
)

logger = logging.getLogger(
    "labeliq.ai"
)


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

GROQ_API_KEY = os.getenv(
    "GROQ_API_KEY"
)

if not GROQ_API_KEY:
    logger.warning(
        "GROQ_API_KEY is not configured. "
        "AI requests will fail until it is provided."
    )


# ============================================================
# TESSERACT
# ============================================================

pytesseract.pytesseract.tesseract_cmd = os.getenv(
    "TESSERACT_CMD",
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)


# ============================================================
# OCR CONFIGURATION
# ============================================================

OCR_MIN_WIDTH = 1800

OCR_MAX_UPSCALE = 3.0

OCR_MAX_DIMENSION = 3600

OCR_CONFIG_GENERAL = (
    "--oem 3 --psm 3"
)

OCR_CONFIG_TABLE = (
    "--oem 3 --psm 6 "
    "-c preserve_interword_spaces=1"
)

MAX_OCR_CHARS = 6000

MAX_GENERAL_OCR_CHARS = 4000


# ============================================================
# UPLOAD CONFIGURATION
# ============================================================

# 10 MB maximum upload size.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


# ============================================================
# GROQ CONFIGURATION
# ============================================================

GROQ_MODEL = "openai/gpt-oss-20b"

GROQ_ATTEMPTS = [
    ("medium", 8192),
    ("low", 16384),
]

AI_INSIGHTS_ATTEMPTS = [
    ("low", 4096),
    ("low", 8192),
]


groq_client = (
    Groq(
        api_key=GROQ_API_KEY
    )
    if GROQ_API_KEY
    else None
)


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="LabelIQ AI Service",
    description=(
        "OCR, AI analysis and analytics "
        "service for LabelIQ"
    ),
    version="1.4.0",
)


# ============================================================
# CUSTOM ERRORS
# ============================================================

class ImageReadError(Exception):
    """
    Uploaded file could not be opened as an image.
    """
    pass


class StructuredOutputError(Exception):
    """
    Groq could not produce valid structured JSON.
    """
    pass


class AIConfigurationError(Exception):
    """
    AI provider configuration is missing.
    """
    pass


# ============================================================
# IMAGE LOADING
# ============================================================

def load_image(
    image_bytes: bytes
) -> Image.Image:
    """
    Open image, fix EXIF orientation and
    flatten transparency.

    This function intentionally does not perform
    OCR preprocessing. It returns a clean RGB image
    that can be reused by downstream processing.
    """

    try:

        image = Image.open(
            io.BytesIO(
                image_bytes
            )
        )

        # Force actual image decoding.
        image.load()

        image = ImageOps.exif_transpose(
            image
        )

        if image.mode in (
            "RGBA",
            "LA",
            "P",
        ):

            image = image.convert(
                "RGBA"
            )

            background = Image.new(
                "RGBA",
                image.size,
                (255, 255, 255, 255),
            )

            background.alpha_composite(
                image
            )

            image = background

        image = image.convert(
            "RGB"
        )

        return image

    except Exception as error:

        raise ImageReadError(
            str(error)
        )


# ============================================================
# IMAGE RESIZING
# ============================================================

def resize_for_ocr(
    image: Image.Image
) -> Image.Image:
    """
    Upscale small images and limit very
    large images.
    """

    width, height = image.size

    if width <= 0 or height <= 0:

        raise ImageReadError(
            "Image has invalid dimensions"
        )

    scale = 1.0

    if width < OCR_MIN_WIDTH:

        scale = min(
            OCR_MIN_WIDTH / width,
            OCR_MAX_UPSCALE,
        )

    if (
        max(width, height) * scale
        > OCR_MAX_DIMENSION
    ):

        scale = (
            OCR_MAX_DIMENSION
            / max(width, height)
        )

    if abs(scale - 1.0) < 0.05:

        return image

    resampling = getattr(
        Image,
        "Resampling",
        Image,
    )

    return image.resize(
        (
            round(width * scale),
            round(height * scale),
        ),
        resampling.LANCZOS,
    )


# ============================================================
# OTSU THRESHOLD
# ============================================================

def otsu_threshold(
    gray: Image.Image
) -> int:
    """
    Calculate a simple Otsu threshold.
    """

    histogram = gray.histogram()

    total = sum(
        histogram
    )

    if total == 0:

        return 128

    sum_all = sum(
        i * count
        for i, count in enumerate(
            histogram
        )
    )

    sum_background = 0

    weight_background = 0

    best_variance = 0

    threshold = 128

    for level in range(256):

        weight_background += (
            histogram[level]
        )

        if weight_background == 0:
            continue

        weight_foreground = (
            total
            - weight_background
        )

        if weight_foreground == 0:
            break

        sum_background += (
            level
            * histogram[level]
        )

        mean_background = (
            sum_background
            / weight_background
        )

        mean_foreground = (
            (
                sum_all
                - sum_background
            )
            / weight_foreground
        )

        variance = (
            weight_background
            * weight_foreground
            * (
                mean_background
                - mean_foreground
            )
            ** 2
        )

        if variance > best_variance:

            best_variance = variance

            threshold = level

    return threshold


# ============================================================
# OCR IMAGE PREPARATION
# ============================================================

def prepare_grayscale(
    image: Image.Image
) -> Image.Image:
    """
    Convert image to grayscale, resize and
    improve contrast.
    """

    gray = ImageOps.grayscale(
        image
    )

    gray = resize_for_ocr(
        gray
    )

    if ImageStat.Stat(
        gray
    ).mean[0] < 110:

        gray = ImageOps.invert(
            gray
        )

    gray = ImageOps.autocontrast(
        gray,
        cutoff=1,
    )

    return gray


# ============================================================
# OCR
# ============================================================

def run_ocr_pass(
    image: Image.Image,
    config: str
) -> str:
    """
    Run one Tesseract OCR pass.
    """

    return pytesseract.image_to_string(
        image,
        config=config,
    )


def clean_lines(
    text: str,
    mark_columns: bool = False,
) -> list:
    """
    Clean OCR lines and remove obvious noise.
    """

    lines = []

    for line in text.replace(
        "\r",
        "\n",
    ).split("\n"):

        line = line.strip()

        if mark_columns:

            line = re.sub(
                r"\s{3,}",
                " | ",
                line,
            )

        line = re.sub(
            r"[ \t]+",
            " ",
            line,
        )

        if not re.search(
            r"[A-Za-z0-9]",
            line,
        ):
            continue

        if (
            len(line) == 1
            and line.isalpha()
        ):
            continue

        lines.append(
            line
        )

    return lines


def line_key(
    line: str
) -> str:
    """
    Normalize OCR line for duplicate detection.
    """

    return re.sub(
        r"[^a-z0-9%]+",
        "",
        line.lower(),
    )


def combine_ocr_passes(
    general_text: str,
    table_text: str,
) -> str:
    """
    Combine general OCR and table OCR while
    avoiding excessive duplication.
    """

    general_lines = clean_lines(
        general_text
    )

    table_lines = clean_lines(
        table_text,
        mark_columns=True,
    )

    general_output = "\n".join(
        general_lines
    )[
        :MAX_GENERAL_OCR_CHARS
    ]

    # Keep table-mode lines even when their normalized text also appears
    # in general OCR. The table pass may contain column spacing that is
    # important to deterministic nutrition parsing.
    seen_table = set()
    extra_lines = []

    for line in table_lines:

        key = line_key(line)

        if not key:
            extra_lines.append(line)
            continue

        if key in seen_table:
            continue

        seen_table.add(key)
        extra_lines.append(line)

    combined = (
        general_output
    )

    if extra_lines:

        header = (
            "\n\n"
            "[TABLE-MODE OCR - "
            "additional lines]\n"
        )

        remaining = (
            MAX_OCR_CHARS
            - len(general_output)
            - len(header)
        )

        if remaining > 0:

            combined += (
                header
                + "\n".join(
                    extra_lines
                )[:remaining]
            )

    return combined.strip()[
        :MAX_OCR_CHARS
    ]


def extract_text_from_image(
    image_bytes: bytes
) -> str:
    """
    Preprocess image and run two OCR passes.
    """

    image = load_image(
        image_bytes
    )

    gray = prepare_grayscale(
        image
    )

    general_image = (
        gray.filter(
            ImageFilter.SHARPEN
        )
    )

    table_image = (
        gray.filter(
            ImageFilter.MedianFilter(
                3
            )
        )
    )

    threshold = otsu_threshold(
        table_image
    )

    table_image = table_image.point(
        lambda pixel:
            255
            if pixel > threshold
            else 0
    )

    general_text = ""

    table_text = ""

    errors = []

    try:

        general_text = run_ocr_pass(
            general_image,
            OCR_CONFIG_GENERAL,
        )

    except Exception as error:

        logger.warning(
            "General OCR pass failed: %s",
            error,
        )

        errors.append(
            error
        )

    try:

        table_text = run_ocr_pass(
            table_image,
            OCR_CONFIG_TABLE,
        )

    except Exception as error:

        logger.warning(
            "Table OCR pass failed: %s",
            error,
        )

        errors.append(
            error
        )

    if len(errors) == 2:

        raise errors[-1]

    return combine_ocr_passes(
        general_text,
        table_text,
    )


# ============================================================
# FOOD LABEL SCHEMA
# ============================================================

FOOD_LABEL_SCHEMA = {

    "type": "object",

    "properties": {

        "product_name": {
            "type": "string",
        },

        "ingredients": {

            "type": "array",

            "items": {
                "type": "string",
            },
        },

        "allergens": {

            "type": "array",

            "items": {
                "type": "string",
            },
        },

        "nutrition": {

            "type": "object",

            "properties": {

                "serving_size": {
                    "type": [
                        "string",
                        "null",
                    ],
                },

                "calories": {
                    "type": [
                        "number",
                        "null",
                    ],
                },

                "protein_g": {
                    "type": [
                        "number",
                        "null",
                    ],
                },

                "carbohydrates_g": {
                    "type": [
                        "number",
                        "null",
                    ],
                },

                "total_fat_g": {
                    "type": [
                        "number",
                        "null",
                    ],
                },

                "saturated_fat_g": {
                    "type": [
                        "number",
                        "null",
                    ],
                },

                "dietary_fiber_g": {
                    "type": [
                        "number",
                        "null",
                    ],
                },

                "total_sugars_g": {
                    "type": [
                        "number",
                        "null",
                    ],
                },

                "added_sugars_g": {
                    "type": [
                        "number",
                        "null",
                    ],
                },

                "sodium_mg": {
                    "type": [
                        "number",
                        "null",
                    ],
                },
            },

            "required": [
                "serving_size",
                "calories",
                "protein_g",
                "carbohydrates_g",
                "total_fat_g",
                "saturated_fat_g",
                "dietary_fiber_g",
                "total_sugars_g",
                "added_sugars_g",
                "sodium_mg",
            ],

            "additionalProperties": False,
        },
    },

    "required": [
        "product_name",
        "ingredients",
        "allergens",
        "nutrition",
    ],

    "additionalProperties": False,
}


# ============================================================
# AI INSIGHTS SCHEMA
# ============================================================

AI_INSIGHTS_SCHEMA = {

    "type": "object",

    "properties": {

        "summary": {
            "type": "string",
        },

        "key_findings": {

            "type": "array",

            "items": {
                "type": "string",
            },
        },

        "ingredient_explanations": {

            "type": "array",

            "items": {

                "type": "object",

                "properties": {

                    "ingredient": {
                        "type": "string",
                    },

                    "explanation": {
                        "type": "string",
                    },

                    "source_name": {
                        "type": [
                            "string",
                            "null",
                        ],
                    },
                },

                "required": [
                    "ingredient",
                    "explanation",
                    "source_name",
                ],

                "additionalProperties": False,
            },
        },
    },

    "required": [
        "summary",
        "key_findings",
        "ingredient_explanations",
    ],

    "additionalProperties": False,
}


# ============================================================
# SYSTEM PROMPTS
# ============================================================

SYSTEM_PROMPT = """
You are a careful food-label data extraction engine.

Your job is structured extraction, not guessing.

STRICT RULES:

1. Use ONLY information supported by the supplied OCR text.

2. Never invent missing information.

3. Never use typical nutritional values for a product.

4. Never infer a nutrition number merely because a number appears
   somewhere in the OCR.

5. If a nutrition value cannot be confidently associated with its
   nutrient, return null.

6. Never treat a percentage such as 7% or 15% as grams or milligrams.

7. Do not mix values from different nutrition columns.

8. Preserve actual zero values as 0.

9. Missing or unreadable values must be null.

10. Return exactly the JSON structure required by the schema.

11. Do not return markdown or explanatory text outside JSON.
"""


AI_INSIGHTS_SYSTEM_PROMPT = """
You are LabelIQ's grounded food-label analysis assistant.

Your job is to generate concise, factual insights using ONLY the supplied
product data and RAG evidence.

STRICT GROUNDING RULES:

1. Never invent ingredients, allergens, nutrition values, health effects,
   dietary properties, or product characteristics.

2. Allergens:
   - Report allergens only when they are explicitly present in the supplied
     extracted data or supported by the supplied evidence.
   - Preserve the extracted allergen wording.
   - Do not convert "may contain" into a definite allergen.
   - Do not claim an allergen is present when the source only says
     "may contain".
   - Do not infer allergens from generic ingredient knowledge unless the
     supplied RAG evidence explicitly supports the statement.

3. Gluten:
   - NEVER describe barley, wheat, rye, oats, or other grains as
     "gluten-free" unless the supplied product data explicitly states that
     the product/ingredient is gluten-free.
   - Do not generate phrases such as "gluten-free grains" based only on
     ingredient names.
   - Do not make a gluten-free certification or suitability claim unless
     explicitly supported by the supplied data.

4. Nutrition:
   - Use only nutrition values supplied in PRODUCT_DATA.
   - Do not invent missing values.
   - Do not convert missing values into zero.

5. Ingredients:
   - Explain only ingredients that actually appear in the supplied
     extracted ingredient list.
   - RAG evidence may explain an ingredient, but must not introduce a new
     ingredient into the product's ingredient list.

6. Health:
   - Do not diagnose medical conditions.
   - Keep health-related observations tied to the supplied nutrition,
     dietary profile, and deterministic rule results.

7. If evidence is insufficient, say that the information is unavailable
   rather than guessing.

Return ONLY valid JSON matching the requested schema.
"""
# ============================================================
# FOOD LABEL EXTRACTION PROMPT
# ============================================================

PROMPT_TEMPLATE = """
Extract food-label information from the OCR text below.

The OCR may contain:

- spelling errors
- duplicated information
- broken nutrition-table rows
- missing columns
- merged columns
- incorrect spacing
- OCR number errors

Accuracy is more important than completeness.

============================================================
PRODUCT NAME
============================================================

Extract the product name only if it is clearly present.

Otherwise return:

"product_name": ""

============================================================
INGREDIENTS
============================================================

Extract ingredients actually present in the OCR.

Rules:

- Include nested ingredients.
- Include ingredients inside parentheses.
- Include oils.
- Include syrups.
- Include sweeteners.
- Include preservatives.
- Include emulsifiers.
- Include flavourings.
- Include additives.
- Remove duplicate ingredients.
- Do not invent ingredients.
- Correct an obvious OCR spelling error only when the intended
  ingredient is unambiguous.

Example:

Peanuts (32%) (Peanuts, Palm Oil, Glucose Syrup)

can produce:

[
  "Peanuts",
  "Palm Oil",
  "Glucose Syrup"
]

============================================================
ALLERGENS
============================================================

Only include allergens explicitly declared by the label.

Look for statements such as:

Contains:
May contain:
Allergy advice:
Allergens:

Do NOT infer allergens simply because an ingredient commonly contains
an allergen.

============================================================
NUTRITION
============================================================

Nutrition extraction is extremely strict.

A numeric value must be clearly associated with its nutrient.

Example:

Protein 8.5 g

means:

protein_g = 8.5

But:

16 g

without a clearly identifiable nutrient name must NOT be assigned
to protein, carbohydrate, fat, sugar, or any other field.

If the association is unclear:

return null.

============================================================
PERCENTAGES
============================================================

Values such as:

7%
15%
(7%)
(15%)

are reference-intake percentages.

They are NOT nutrition quantities.

Never convert them into grams or milligrams.

============================================================
NUTRITION FIELD MAPPING
============================================================

Energy / Calories / kcal
→ calories

Fat / Total fat
→ total_fat_g

Saturates / Saturated fat
→ saturated_fat_g

Carbohydrate / Carbohydrates
→ carbohydrates_g

Sugars / Total sugars
→ total_sugars_g

Added sugars
→ added_sugars_g

Fibre / Fiber / Dietary fibre
→ dietary_fiber_g

Protein
→ protein_g

Sodium
→ sodium_mg

============================================================
SALT
============================================================

If ONLY salt is provided and sodium is not provided, salt may be
converted to sodium approximately using:

sodium_mg = salt_g × 400

Only perform this conversion when the OCR clearly identifies the
value as salt.

Never convert an arbitrary number into sodium.

============================================================
ENERGY
============================================================

If both kcal and kJ are visible:

prefer kcal.

Example:

583 kJ
140 kcal

means:

calories = 140

If only kJ is clearly identified:

calories = kJ / 4.184

Never treat kJ as kcal.

============================================================
NUTRITION COLUMNS
============================================================

Labels may contain:

- per 100 g
- per 100 ml
- per serving
- per portion
- % reference intake

Do NOT mix columns.

Prefer the per-serving column if it is clearly identifiable.

Otherwise use the per-100-g column.

If the column relationship is unclear, return null rather than mixing
values.

============================================================
SERVING SIZE
============================================================

serving_size must be a string.

Examples:

"32 g"

"100 g"

"1 bar (32 g)"

Do not confuse package weight with serving size.

============================================================
ZERO VALUES
============================================================

A real value of:

0 g

means:

0

Do not convert it to null.

Use null only for missing or unreliable values.

============================================================
ANTI-HALLUCINATION EXAMPLE
============================================================

If OCR contains:

Nutrition Information 100g 32g
Portion size: 32g
140kcal
16g
0.06
1%
7%

and the nutrient labels associated with 16g and 0.06 are not readable,
DO NOT guess their nutrient fields.

Return:

protein_g = null
carbohydrates_g = null
total_fat_g = null
saturated_fat_g = null
dietary_fiber_g = null
total_sugars_g = null
added_sugars_g = null
sodium_mg = null

============================================================
OCR TEXT
============================================================

< OCR_TEXT >
"""


def build_prompt(
    ocr_text: str
) -> str:
    """
    Insert OCR text into the extraction prompt.
    """

    return PROMPT_TEMPLATE.replace(
        "< OCR_TEXT >",
        ocr_text,
    )


# ============================================================
# GROQ CLIENT VALIDATION
# ============================================================

def require_groq_client():
    """
    Return configured Groq client or raise a controlled error.
    """

    if groq_client is None:

        raise AIConfigurationError(
            "GROQ_API_KEY is not configured"
        )

    return groq_client


# ============================================================
# GROQ FOOD LABEL CALL
# ============================================================

def call_groq(
    prompt: str,
    max_tokens: int,
    reasoning_effort: str,
):
    """
    Call Groq for structured food-label extraction.
    """

    client = require_groq_client()

    return client.chat.completions.create(

        model=GROQ_MODEL,

        messages=[
            {
                "role": "system",
                "content": SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],

        temperature=0,

        max_completion_tokens=max_tokens,

        reasoning_effort=reasoning_effort,

        response_format={
            "type": "json_schema",

            "json_schema": {

                "name": "food_label",

                "strict": True,

                "schema": FOOD_LABEL_SCHEMA,
            },
        },
    )


# ============================================================
# GROQ FOOD LABEL EXTRACTION
# ============================================================

def extract_with_groq(
    prompt: str
) -> dict:
    """
    Call Groq and retry structured-output failures.
    """

    last_error = None

    for attempt, (
        effort,
        max_tokens,
    ) in enumerate(
        GROQ_ATTEMPTS,
        1,
    ):

        try:

            logger.info(
                "Groq food extraction attempt %s/%s",
                attempt,
                len(GROQ_ATTEMPTS),
            )

            response = call_groq(
                prompt,
                max_tokens,
                effort,
            )

            if not response.choices:

                raise StructuredOutputError(
                    "Groq returned no choices"
                )

            content = (
                response
                .choices[0]
                .message
                .content
            )

            if not content:

                raise StructuredOutputError(
                    "Groq returned empty content"
                )

            result = json.loads(
                content
            )

            if not isinstance(
                result,
                dict,
            ):

                raise StructuredOutputError(
                    "Groq returned JSON that is not an object"
                )

            return result

        except json.JSONDecodeError as error:

            logger.warning(
                "Groq extraction attempt %s "
                "returned invalid JSON: %s",
                attempt,
                error,
            )

            last_error = error

        except groq.BadRequestError as error:

            error_text = str(
                error
            )

            if (
                "json_validate_failed"
                in error_text
                or "json_validate"
                in error_text
            ):

                logger.warning(
                    "Groq extraction attempt %s "
                    "failed structured validation: %s",
                    attempt,
                    error,
                )

                last_error = error

                continue

            raise

        except StructuredOutputError as error:

            logger.warning(
                "Groq extraction attempt %s failed: %s",
                attempt,
                error,
            )

            last_error = error

    raise StructuredOutputError(
        "Food label extraction failed after "
        f"{len(GROQ_ATTEMPTS)} attempts: "
        f"{last_error}"
    )


# ============================================================
# AI INSIGHTS PROMPT
# ============================================================

AI_INSIGHTS_PROMPT = """
Generate grounded AI insights for this food product.

IMPORTANT:

The output MUST contain exactly these required fields:

{
  "summary": "string",
  "key_findings": [
    "string"
  ],
  "ingredient_explanations": [
    {
      "ingredient": "string",
      "explanation": "string",
      "source_name": "string or null"
    }
  ]
}

CRITICAL:

"ingredient_explanations" MUST ALWAYS EXIST.

If no reliable RAG evidence exists, return:

"ingredient_explanations": []

Do NOT omit the field.

============================================================
PRODUCT DATA
============================================================

<PRODUCT_DATA>

============================================================
RETRIEVED RAG EVIDENCE
============================================================

<RAG_EVIDENCE>

============================================================
SUMMARY
============================================================

Provide a concise summary based only on the supplied product data.

Do not invent nutrition values.

============================================================
KEY FINDINGS
============================================================

Include useful observations that are directly supported by the supplied
label data.

Do not make unsupported health claims.

============================================================
INGREDIENT EXPLANATIONS
============================================================

Only include an ingredient when:

1. It appears in the extracted ingredient list.
2. Reliable RAG evidence exists for that ingredient.
3. The evidence actually corresponds to that ingredient.

If these conditions are not satisfied, do not include the ingredient.

The source_name must come from the supplied RAG evidence.

If there is no source name, use null.

Never invent a source.

============================================================
FINAL REQUIREMENT
============================================================

Always return:

summary
key_findings
ingredient_explanations

Return ONLY valid JSON.
"""


# ============================================================
# AI INSIGHTS NORMALIZATION
# ============================================================

def normalize_ai_insights(
    result
) -> dict:
    """
    Normalize and validate the shape of AI insights.

    This provides an additional application-level safety layer
    after Groq structured-output validation.
    """

    if not isinstance(
        result,
        dict,
    ):

        raise StructuredOutputError(
            "AI insights result is not an object"
        )

    summary = result.get(
        "summary",
        "",
    )

    if not isinstance(
        summary,
        str,
    ):

        summary = ""

    key_findings = result.get(
        "key_findings",
        [],
    )

    if not isinstance(
        key_findings,
        list,
    ):

        key_findings = []

    cleaned_findings = []

    for finding in key_findings:

        if isinstance(
            finding,
            str,
        ):

            finding = finding.strip()

            if finding:

                cleaned_findings.append(
                    finding[:500]
                )

    explanations = result.get(
        "ingredient_explanations",
        [],
    )

    if not isinstance(
        explanations,
        list,
    ):

        explanations = []

    cleaned_explanations = []

    for item in explanations:

        if not isinstance(
            item,
            dict,
        ):

            continue

        ingredient = item.get(
            "ingredient"
        )

        explanation = item.get(
            "explanation"
        )

        source_name = item.get(
            "source_name"
        )

        if not isinstance(
            ingredient,
            str,
        ):

            continue

        if not isinstance(
            explanation,
            str,
        ):

            continue

        ingredient = ingredient.strip()

        explanation = explanation.strip()

        if not ingredient or not explanation:

            continue

        if source_name is not None:

            if not isinstance(
                source_name,
                str,
            ):

                source_name = None

            else:

                source_name = (
                    source_name.strip()
                    or None
                )

        cleaned_explanations.append({

            "ingredient":
                ingredient[:255],

            "explanation":
                explanation[:1000],

            "source_name":
                source_name,
        })

    return {

        "summary":
            summary.strip()[:1500],

        "key_findings":
            cleaned_findings,

        "ingredient_explanations":
            cleaned_explanations,
    }


# ============================================================
# AI INSIGHTS FALLBACK
# ============================================================

def build_ai_insights_fallback(
    reason: str = ""
) -> dict:
    """
    Safe fallback when secondary AI insights fail.

    This intentionally does not invent health claims or ingredient
    explanations.
    """

    logger.warning(
        "Using AI insights fallback. Reason: %s",
        reason,
    )

    return {

        "summary":
            "AI-generated insights are temporarily unavailable. "
            "The extracted label data and available evidence "
            "can still be reviewed.",

        "key_findings": [
            "AI insights could not be generated for this scan."
        ],

        "ingredient_explanations": [],
    }


# ============================================================
# AI INSIGHTS GROQ CALL
# ============================================================

def call_ai_insights_groq(
    prompt: str,
    max_tokens: int,
    reasoning_effort: str,
):
    """
    Call Groq for grounded AI insights.
    """

    client = require_groq_client()

    return client.chat.completions.create(

        model=GROQ_MODEL,

        messages=[
            {
                "role": "system",
                "content":
                    AI_INSIGHTS_SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],

        temperature=0,

        max_completion_tokens=max_tokens,

        reasoning_effort=reasoning_effort,

        response_format={
            "type": "json_schema",

            "json_schema": {

                "name": "ai_insights",

                "strict": True,

                "schema":
                    AI_INSIGHTS_SCHEMA,
            },
        },
    )


# ============================================================
# GENERATE AI INSIGHTS
# ============================================================

def generate_ai_insights(
    ai_analysis: dict,
    rag_evidence: list,
) -> dict:
    """
    Generate grounded AI insights.

    AI insights are secondary enrichment. ANY provider failure
    (rate limit, connection, 5xx, non-recoverable 400) returns a safe
    fallback instead of destroying the primary OCR + extraction result.
    """

    product_data = json.dumps(
        ai_analysis,
        ensure_ascii=False,
        indent=2,
    )

    evidence_data = json.dumps(
        rag_evidence,
        ensure_ascii=False,
        indent=2,
    )

    prompt = (
        AI_INSIGHTS_PROMPT
        .replace("<PRODUCT_DATA>", product_data)
        .replace("<RAG_EVIDENCE>", evidence_data)
    )

    last_error = None

    for attempt, (effort, max_tokens) in enumerate(
        AI_INSIGHTS_ATTEMPTS,
        1,
    ):

        try:

            logger.info(
                "AI insights attempt %s/%s",
                attempt,
                len(AI_INSIGHTS_ATTEMPTS),
            )

            response = call_ai_insights_groq(
                prompt,
                max_tokens,
                effort,
            )

            if not response.choices:
                raise StructuredOutputError(
                    "AI insights returned no choices"
                )

            content = response.choices[0].message.content

            if not content:
                raise StructuredOutputError(
                    "AI insights response was empty"
                )

            result = json.loads(content)

            normalized = normalize_ai_insights(result)

            source_text = (
                product_data
                + "\n"
                + evidence_data
            )

            return filter_unsupported_insight_claims(
                normalized,
                source_text,
            )

            

        except json.JSONDecodeError as error:

            logger.warning(
                "AI insights attempt %s returned invalid JSON: %s",
                attempt,
                error,
            )

            last_error = error

        except groq.BadRequestError as error:

            error_text = str(error)

            last_error = error

            if (
                "json_validate_failed" in error_text
                or "json_validate" in error_text
            ):

                logger.warning(
                    "AI insights attempt %s failed structured "
                    "validation: %s",
                    attempt,
                    error,
                )

                continue

            logger.warning(
                "AI insights attempt %s rejected by provider "
                "(not retryable): %s",
                attempt,
                error,
            )

            break

        except (
            groq.RateLimitError,
            groq.APIConnectionError,
            groq.APIStatusError,
            AIConfigurationError,
        ) as error:

            logger.warning(
                "AI insights provider error on attempt %s: %s",
                attempt,
                error,
            )

            last_error = error

            break

        except StructuredOutputError as error:

            logger.warning(
                "AI insights attempt %s failed: %s",
                attempt,
                error,
            )

            last_error = error

    return build_ai_insights_fallback(
        str(last_error)
    )


_GLUTEN_CLAIM_RE = re.compile(
    r"\bgluten[- ]free\b",
    re.IGNORECASE,
)


def _split_sentences(text: str) -> list[str]:
    if not isinstance(text, str):
        return []

    return [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", text)
        if sentence.strip()
    ]


def filter_unsupported_insight_claims(
    insights: dict,
    source_text: str,
) -> dict:
    """
    Remove unsupported gluten-free claims from generated insights.

    A gluten-free claim is allowed only when the supplied source text
    explicitly contains a gluten-free statement.
    """

    if not isinstance(insights, dict):
        return insights

    source_text = str(source_text or "")

    has_explicit_gluten_free_support = bool(
        _GLUTEN_CLAIM_RE.search(source_text)
    )

    if has_explicit_gluten_free_support:
        return insights

    removed_count = 0

    summary = insights.get("summary")

    if isinstance(summary, str):
        sentences = _split_sentences(summary)

        filtered = [
            sentence
            for sentence in sentences
            if not _GLUTEN_CLAIM_RE.search(sentence)
        ]

        removed_count += len(sentences) - len(filtered)

        insights["summary"] = " ".join(filtered)

    key_findings = insights.get("key_findings")

    if isinstance(key_findings, list):
        filtered_findings = []

        for finding in key_findings:
            if (
                isinstance(finding, str)
                and _GLUTEN_CLAIM_RE.search(finding)
            ):
                removed_count += 1
                continue

            filtered_findings.append(finding)

        insights["key_findings"] = filtered_findings

    warnings = insights.get("warnings")

    if isinstance(warnings, list):
        filtered_warnings = []

        for warning in warnings:
            if (
                isinstance(warning, str)
                and _GLUTEN_CLAIM_RE.search(warning)
            ):
                removed_count += 1
                continue

            filtered_warnings.append(warning)

        insights["warnings"] = filtered_warnings

    explanations = insights.get("ingredient_explanations")

    if isinstance(explanations, list):
        filtered_explanations = []

        for item in explanations:
            if not isinstance(item, dict):
                continue

            explanation = item.get("explanation")

            if (
                isinstance(explanation, str)
                and _GLUTEN_CLAIM_RE.search(explanation)
            ):
                removed_count += 1
                continue

            filtered_explanations.append(item)

        insights["ingredient_explanations"] = filtered_explanations

    if removed_count:
        logger.warning(
            "Removed %s unsupported gluten-free insight claim(s)",
            removed_count,
        )

    return insights

# ============================================================
# STRING LIST CLEANING
# ============================================================

_PROVENANCE_RE = re.compile(
    r"""
    \s*
    (?:
        \(
        |
        \[
        |
        \{
    )
    \s*
    (?:
        derived\s+from
        |
        made\s+from
        |
        made\s+with
        |
        from
        |
        source
    )
    \s*:
    ?
    .*$
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Also handles OCR/provenance text where the qualifier is not preceded by
# a clean opening bracket, e.g. "Whey permeate [from Milk".
_PROVENANCE_TAIL_RE = re.compile(
    r"""
    \s*
    (?:
        \[
        |
        \(
        |
        \{
    )?
    \s*
    (?:
        derived\s+from
        |
        made\s+from
        |
        made\s+with
        |
        from
        |
        source\s*:
    )
    \s+.*$
    """,
    re.IGNORECASE | re.VERBOSE,
)


def _balance_brackets(value: str) -> str:
    """
    Normalize common OCR bracket damage without inventing content.
    """

    if not value:
        return ""

    value = (
        value
        .replace("[", "(")
        .replace("]", ")")
        .replace("{", "(")
        .replace("}", ")")
    )

    result = []
    depth = 0

    for char in value:
        if char == "(":
            depth += 1
            result.append(char)

        elif char == ")":
            if depth > 0:
                depth -= 1
                result.append(char)

        else:
            result.append(char)

    while depth > 0:
        result.append(")")
        depth -= 1

    return "".join(result)


def _unwrap_outer_brackets(value: str) -> str:
    """
    Remove only redundant outer brackets.
    """

    value = value.strip()

    changed = True

    while changed and len(value) >= 2:
        changed = False

        if value[0] == "(" and value[-1] == ")":
            depth = 0
            closes_at_end = True

            for index, char in enumerate(value):
                if char == "(":
                    depth += 1
                elif char == ")":
                    depth -= 1

                    if depth == 0 and index != len(value) - 1:
                        closes_at_end = False
                        break

            if closes_at_end and depth == 0:
                value = value[1:-1].strip()
                changed = True

    return value


def clean_string_list(
    items
) -> list:
    """
    Clean ingredient/allergen lists.

    Removes OCR percentage qualifiers and obvious provenance tails such as:
    "Whey permeate [from Milk".

    Does not infer or invent values.
    """

    if not isinstance(items, list):
        return []

    seen = set()
    result = []

    for item in items:

        if not isinstance(item, str):
            continue

        name = item.strip()

        if not name:
            continue

        # Remove percentage annotations such as "(32%)" or "32%".
        name = re.sub(
            r"\s*\(?\d+(?:[.,]\d+)?\s*%\)?",
            "",
            name,
        )

        # Remove malformed provenance qualifiers.
        name = _PROVENANCE_RE.sub("", name)
        name = _PROVENANCE_TAIL_RE.sub("", name)

        # Normalize bracket types and repair an unclosed opening bracket.
        name = _balance_brackets(name)

        # Remove empty/redundant outer brackets.
        name = _unwrap_outer_brackets(name)

        # Normalize whitespace.
        name = re.sub(
            r"\s+",
            " ",
            name,
        ).strip(
            " \t.,;:"
        )

        # Remove only unmatched closing brackets left by OCR.
        name = name.rstrip(")]}")

        if (
            not name
            or name.isdigit()
        ):
            continue

        key = re.sub(
            r"\s+",
            " ",
            name.lower(),
        ).strip()

        if key in seen:
            continue

        seen.add(key)

        result.append(
            name[:255]
        )

    return result


# ============================================================
# NUTRITION CLEANING
# ============================================================

def clean_nutrition(
    nutrition: dict,
    ocr_text: str,
    image,
) -> dict:
    """
    Delegate nutrition extraction to the dedicated deterministic
    nutrition service.

    Coordinate-based OCR and nutrition validation belong in
    nutrition_service.py rather than this application layer.
    """

    return process_nutrition(
        image,
        ocr_text,
        nutrition,
    )


# ============================================================
# FINAL AI ANALYSIS CLEANING
# ============================================================

def clean_ai_analysis(
    ai_analysis: dict,
    ocr_text: str,
    image,
) -> dict:
    """
    Return a clean, predictable analysis object.
    """

    if not isinstance(
        ai_analysis,
        dict,
    ):

        ai_analysis = {}

    product_name = ai_analysis.get(
        "product_name"
    )

    if not isinstance(
        product_name,
        str,
    ):

        product_name = ""

    ingredients = clean_string_list(
        ai_analysis.get(
            "ingredients"
        )
    )

    allergens = clean_string_list(
        ai_analysis.get(
            "allergens"
        )
    )

    nutrition = clean_nutrition(
        ai_analysis.get(
            "nutrition"
        ),
        ocr_text,
        image,
    )

    return {

        "product_name":
            product_name.strip()[:255],

        "ingredients":
            ingredients,

        "allergens":
            allergens,

        "nutrition":
            nutrition,
    }


# ============================================================
# RAG EVIDENCE
# ============================================================

def get_rag_evidence(
    ingredients: list
) -> list:
    """
    Retrieve evidence for each extracted ingredient.

    RAG is enrichment. A failed lookup for one ingredient must
    not destroy the entire scan.
    """

    results = []

    if not ingredients:

        return results

    for ingredient in ingredients:

        try:

            evidence = get_ingredient_evidence(
                ingredient
            )

            if not isinstance(
                evidence,
                list,
            ):

                evidence = []

            results.append({

                "ingredient":
                    ingredient,

                "evidence":
                    evidence,
            })

        except Exception as error:

            logger.warning(
                "RAG lookup failed for '%s': %s",
                ingredient,
                error,
            )

            results.append({

                "ingredient":
                    ingredient,

                "evidence":
                    [],
            })

    return results


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health_check():
    """
    Basic service health check.
    """

    return {

        "success":
            True,

        "message":
            "LabelIQ AI service is running",

        "ai_provider_configured":
            groq_client is not None,
    }


# ============================================================
# SCAN FOOD LABEL
# ============================================================

@app.post("/scan")
async def scan_label(
    file: UploadFile = File(...)
):
    """
    Complete food-label analysis pipeline.

    Pipeline:

    1. Validate upload
    2. Load image
    3. OCR
    4. Groq structured extraction
    5. Deterministic nutrition cleaning
    6. RAG evidence
    7. Grounded AI insights
    8. Return stable response
    """

    try:

        # ====================================================
        # 1. VALIDATE FILE TYPE
        # ====================================================

        if (
            not file.content_type
            or not file.content_type.startswith(
                "image/"
            )
        ):

            raise HTTPException(
                status_code=400,
                detail="Only image files are allowed",
            )


        # ====================================================
        # 2. READ IMAGE
        # ====================================================

        image_bytes = await file.read()

        if not image_bytes:

            raise HTTPException(
                status_code=400,
                detail="Uploaded image is empty",
            )

        if (
            len(image_bytes)
            > MAX_UPLOAD_BYTES
        ):

            raise HTTPException(
                status_code=413,
                detail=(
                    "Image file is too large. "
                    "Maximum allowed size is 10 MB."
                ),
            )


        # ====================================================
        # 3. LOAD / VALIDATE IMAGE
        # ====================================================

        image = load_image(
            image_bytes
        )


        # ====================================================
        # 4. OCR
        # ====================================================

        extracted_text = (
            await run_in_threadpool(
                extract_text_from_image,
                image_bytes,
            )
        )

        if not extracted_text:

            raise HTTPException(
                status_code=422,
                detail=(
                    "No readable text could be "
                    "extracted from the image"
                ),
            )

        logger.info(
            "OCR completed. Characters extracted: %s",
            len(extracted_text),
        )


        # ====================================================
        # 5. GROQ FOOD LABEL EXTRACTION
        # ====================================================

        prompt = build_prompt(
            extracted_text
        )

        raw_analysis = (
            await run_in_threadpool(
                extract_with_groq,
                prompt,
            )
        )


        # ====================================================
        # 6. CLEAN / VALIDATE AI ANALYSIS
        # ====================================================

        ai_analysis = await run_in_threadpool(
            clean_ai_analysis,
            raw_analysis,
            extracted_text,
            image,
        )

        logger.info(
            "Deterministic label cleaning and nutrition validation completed"
        )


        # ====================================================
        # 7. RAG EVIDENCE
        # ====================================================

        rag_evidence = (
            await run_in_threadpool(
                get_rag_evidence,
                ai_analysis[
                    "ingredients"
                ],
            )
        )


        # ====================================================
        # 8. AI INSIGHTS
        # ====================================================

        ai_insights = (
            await run_in_threadpool(
                generate_ai_insights,
                ai_analysis,
                rag_evidence,
            )
        )


        # ====================================================
        # 9. RETURN RESULT
        # ====================================================

        return {

            "success":
                True,

            "filename":
                file.filename,

            "ocr": {

                "text":
                    extracted_text,
            },

            "ai_analysis":
                ai_analysis,

            "rag": {

                "sources":
                    rag_evidence,
            },

            "ai_insights":
                ai_insights,
        }


    # ========================================================
    # CLIENT / VALIDATION ERROR
    # ========================================================

    except HTTPException:

        raise


    # ========================================================
    # IMAGE ERROR
    # ========================================================

    except ImageReadError as error:

        logger.error(
            "Image read error: %s",
            error,
        )

        raise HTTPException(
            status_code=400,
            detail=(
                "Could not read the uploaded image. "
                "Please upload a valid image file."
            ),
        )


    # ========================================================
    # AI CONFIGURATION ERROR
    # ========================================================

    except AIConfigurationError as error:

        logger.error(
            "AI configuration error: %s",
            error,
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "AI service is not configured correctly"
            ),
        )


    # ========================================================
    # GROQ RATE LIMIT
    # ========================================================

    except groq.RateLimitError as error:

        logger.error(
            "Groq rate limit error: %s",
            error,
        )

        raise HTTPException(
            status_code=429,
            detail=(
                "AI provider rate limit reached. "
                "Please try again later."
            ),
        )


    # ========================================================
    # GROQ CONNECTION ERROR
    # ========================================================

    except groq.APIConnectionError as error:

        logger.error(
            "Groq connection error: %s",
            error,
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Could not reach the AI provider"
            ),
        )


    # ========================================================
    # GROQ API ERROR
    # ========================================================

    except groq.APIStatusError as error:

        logger.error(
            "Groq API error: %s",
            error,
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "AI provider returned an error"
            ),
        )


    # ========================================================
    # STRUCTURED JSON ERROR
    # ========================================================

    except StructuredOutputError as error:

        logger.error(
            "Structured AI output error: %s",
            error,
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "AI service could not produce "
                "a valid structured response"
            ),
        )


    # ========================================================
    # GENERAL ERROR
    # ========================================================

    except Exception as error:

        logger.exception(
            "Unexpected scan error: %s",
            error,
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to process the food label"
            ),
        )