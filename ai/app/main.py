from fastapi import FastAPI, UploadFile, File, HTTPException
from PIL import Image
import io
import pytesseract


# Tesseract OCR executable
pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)


app = FastAPI(
    title="LabelIQ AI Service",
    description="OCR, RAG and analytics service for LabelIQ",
    version="1.0.0"
)


@app.get("/health")
def health_check():
    return {
        "success": True,
        "message": "LabelIQ AI service is running"
    }


@app.post("/scan")
async def scan_label(file: UploadFile = File(...)):
    try:
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail="Only image files are allowed"
            )

        image_bytes = await file.read()

        image = Image.open(
            io.BytesIO(image_bytes)
        )

        extracted_text = pytesseract.image_to_string(image)

        return {
            "success": True,
            "filename": file.filename,
            "ocr": {
                "text": extracted_text
            }
        }

    except HTTPException:
        raise

    except Exception as error:
        print("OCR error:", error)

        raise HTTPException(
            status_code=500,
            detail="Failed to process image"
        )