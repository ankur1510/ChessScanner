import os
import io
import re
import tempfile
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from chessimg2pos import ChessPositionPredictor
from chessimg2pos.constants import DEFAULT_CLASSIFIER
from chessimg2pos.model_loader import download_pretrained_model
from PIL import Image, ImageEnhance

app = FastAPI()


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# Lazy-loaded chess recognition predictor
#
# IMPORTANT:
# Do NOT download/load the model while importing main.py.
# Render needs Uvicorn to bind to its assigned port first.
#
# The predictor is created only on the first recognition
# request and then reused for all subsequent requests.
# ---------------------------------------------------------

predictor = None


def get_predictor():
    global predictor

    if predictor is None:
        print("Initializing chess recognition model...")

        model_path = download_pretrained_model()

        predictor = ChessPositionPredictor(
            model_path=model_path,
            classifier=DEFAULT_CLASSIFIER,
        )

        print("Chess recognition model initialized.")

    return predictor


def fix_fen_format(raw_fen: str) -> str:
    board_part = raw_fen.split(" ")[0]
    rows = board_part.split("/")
    compressed_rows = []

    for row in rows:
        comp_row = re.sub(
            r"(1+)",
            lambda m: str(len(m.group(1))),
            row
        )
        compressed_rows.append(comp_row)

    return "/".join(compressed_rows)


@app.post("/extract-click")
async def extract_click(
    x: float = Form(...),
    y: float = Form(...),
    image: UploadFile = File(...)
):
    contents = await image.read()

    # -----------------------------------------------------
    # 1. Load image into OpenCV
    # -----------------------------------------------------

    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return {
            "error": "Could not decode uploaded image.",
            "fen": "start"
        }

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # -----------------------------------------------------
    # 2. Find contours
    # -----------------------------------------------------

    thresh = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        11,
        2
    )

    contours, _ = cv2.findContours(
        thresh,
        cv2.RETR_LIST,
        cv2.CHAIN_APPROX_SIMPLE
    )

    candidates = []

    for cnt in contours:
        cx, cy, cw, ch = cv2.boundingRect(cnt)

        aspect = cw / float(ch)

        # Look for squares large enough to be a chessboard
        if 0.90 <= aspect <= 1.10 and cw > 150:

            # The square must contain the exact click coordinate
            if cx <= x <= cx + cw and cy <= y <= cy + ch:
                candidates.append(
                    (cw * ch, cx, cy, cw, ch)
                )

    if not candidates:
        return {
            "error": (
                "Could not auto-detect a chessboard boundary "
                "at that click location."
            ),
            "fen": "start"
        }

    # -----------------------------------------------------
    # 3. Pick smallest valid chessboard bounding box
    # -----------------------------------------------------

    candidates.sort(key=lambda item: item[0])

    _, bx, by, bw, bh = candidates[0]

    # -----------------------------------------------------
    # 4. Crop the chessboard
    # -----------------------------------------------------

    cropped_cv = img[
        by:by + bh,
        bx:bx + bw
    ]

    # Convert OpenCV BGR → RGB
    cropped_rgb = cv2.cvtColor(
        cropped_cv,
        cv2.COLOR_BGR2RGB
    )

    pil_img = Image.fromarray(cropped_rgb)

    # -----------------------------------------------------
    # 5. Prepare image for chessimg2pos
    # -----------------------------------------------------

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=".png"
    ) as temp_file:

        pil_img = pil_img.resize((400, 400))
        pil_img = pil_img.convert("L")

        enhancer = ImageEnhance.Contrast(pil_img)
        pil_img = enhancer.enhance(1.8)

        pil_img = pil_img.convert("RGB")

        # Preserve existing debug output
        pil_img.save(
            "debug_crop.png",
            format="PNG"
        )

        pil_img.save(
            temp_file.name,
            format="PNG"
        )

        temp_file_path = temp_file.name

    # -----------------------------------------------------
    # 6. Recognize chess position
    #
    # Predictor is initialized only on the first request
    # and reused thereafter.
    # -----------------------------------------------------

    try:
        chess_predictor = get_predictor()

        result = chess_predictor.predict_chessboard(
            temp_file_path
        )

        raw_fen = result["fen"]

        clean_fen = fix_fen_format(raw_fen)

        if " " not in clean_fen:
            clean_fen += " w - - 0 1"

        return {
            "fen": clean_fen
        }

    except Exception as e:
        return {
            "error": str(e),
            "fen": "start"
        }

    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)