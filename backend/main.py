import os
import re
import tempfile

import cv2
import numpy as np
import torch

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware

from chessimg2pos import ChessPositionPredictor
from chessimg2pos.constants import DEFAULT_CLASSIFIER
from chessimg2pos.model_loader import download_pretrained_model
from chessimg2pos.chessboard_image import get_chessboard_tiles

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
# The model is NOT loaded during application startup.
# This allows Render/Uvicorn to bind to its assigned port
# immediately.
#
# The predictor is created on the first /extract-click
# request and then reused for subsequent requests.
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
            row,
        )
        compressed_rows.append(comp_row)

    return "/".join(compressed_rows)


def predict_chessboard_batched(chess_predictor, image_path):
    """
    Perform chessboard recognition using ONE batched
    PyTorch inference call instead of 64 individual
    model() calls.

    This uses the same:
      - board image
      - 64 tiles
      - grayscale setting
      - resize/normalization transform
      - trained model
      - FEN character mapping

    Only the inference batching is changed.
    """

    # Get the exact same 64 tiles used by chessimg2pos.
    tiles = get_chessboard_tiles(
        image_path,
        use_grayscale=chess_predictor.use_grayscale,
    )

    if len(tiles) != 64:
        raise ValueError(
            f"Expected 64 tiles, got {len(tiles)}"
        )

    # Apply the EXACT same transform that predict_tile()
    # uses, but apply it to all 64 tiles before inference.
    tensors = []

    for tile in tiles:
        tile_img = tile.copy()

        if chess_predictor.use_grayscale:
            tile_img = tile_img.convert("L")

        tensor = chess_predictor.transform(tile_img)

        tensors.append(tensor)

    # Shape:
    # [64, 1, 32, 32] for grayscale
    # or
    # [64, 3, 32, 32] for RGB
    batch = torch.stack(tensors).to(
        chess_predictor.device
    )

    # ONE PyTorch inference call.
    with torch.no_grad():
        outputs = chess_predictor.model(batch)

        probabilities = torch.nn.functional.softmax(
            outputs,
            dim=1,
        )

        max_probs, predicted_indices = torch.max(
            probabilities,
            dim=1,
        )

    predictions = []

    for i in range(64):
        predicted_idx = predicted_indices[i].item()
        probability = max_probs[i].item()

        fen_char = chess_predictor.fen_chars[predicted_idx]

        row = 7 - (i // 8)
        col = i % 8

        square = (
            chr(97 + col)
            + str(row + 1)
        )

        predictions.append(
            (
                square,
                fen_char,
                probability,
            )
        )

    # -----------------------------------------------------
    # Build FEN exactly like chessimg2pos.predict_chessboard
    # -----------------------------------------------------

    board_matrix = np.zeros(
        (8, 8),
        dtype=object,
    )

    for square, fen_char, _ in predictions:

        row = 7 - (
            ord(square[1]) - ord("1")
        )

        col = ord(square[0]) - ord("a")

        board_matrix[row, col] = fen_char

    fen_rows = []

    for row in board_matrix:
        fen_row = "".join(row)
        fen_rows.append(fen_row)

    fen_notation = "/".join(fen_rows)

    return fen_notation


@app.post("/extract-click")
async def extract_click(
    x: float = Form(...),
    y: float = Form(...),
    image: UploadFile = File(...),
):
    contents = await image.read()

    # -----------------------------------------------------
    # 1. Load image into OpenCV
    # -----------------------------------------------------

    nparr = np.frombuffer(
        contents,
        np.uint8,
    )

    img = cv2.imdecode(
        nparr,
        cv2.IMREAD_COLOR,
    )

    if img is None:
        return {
            "error": "Could not decode uploaded image.",
            "fen": "start",
        }

    gray = cv2.cvtColor(
        img,
        cv2.COLOR_BGR2GRAY,
    )

    # -----------------------------------------------------
    # 2. Find contours
    # -----------------------------------------------------

    thresh = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        11,
        2,
    )

    contours, _ = cv2.findContours(
        thresh,
        cv2.RETR_LIST,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    candidates = []

    for cnt in contours:
        cx, cy, cw, ch = cv2.boundingRect(cnt)

        aspect = cw / float(ch)

        # Look for squares large enough to be a chessboard.
        if 0.90 <= aspect <= 1.10 and cw > 150:

            # The square must contain the click coordinate.
            if (
                cx <= x <= cx + cw
                and cy <= y <= cy + ch
            ):
                candidates.append(
                    (
                        cw * ch,
                        cx,
                        cy,
                        cw,
                        ch,
                    )
                )

    if not candidates:
        return {
            "error": (
                "Could not auto-detect a chessboard "
                "boundary at that click location."
            ),
            "fen": "start",
        }

    # -----------------------------------------------------
    # 3. Pick smallest valid chessboard bounding box
    # -----------------------------------------------------

    candidates.sort(
        key=lambda item: item[0]
    )

    _, bx, by, bw, bh = candidates[0]

    # -----------------------------------------------------
    # 4. Crop chessboard
    # -----------------------------------------------------

    cropped_cv = img[
        by:by + bh,
        bx:bx + bw,
    ]

    cropped_rgb = cv2.cvtColor(
        cropped_cv,
        cv2.COLOR_BGR2RGB,
    )

    pil_img = Image.fromarray(
        cropped_rgb
    )

    # -----------------------------------------------------
    # 5. Prepare image
    # -----------------------------------------------------

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=".png",
    ) as temp_file:

        pil_img = pil_img.resize(
            (400, 400)
        )

        pil_img = pil_img.convert("L")

        enhancer = ImageEnhance.Contrast(
            pil_img
        )

        pil_img = enhancer.enhance(1.8)

        pil_img = pil_img.convert("RGB")

        # Preserve existing debug output.
        pil_img.save(
            "debug_crop.png",
            format="PNG",
        )

        pil_img.save(
            temp_file.name,
            format="PNG",
        )

        temp_file_path = temp_file.name

    # -----------------------------------------------------
    # 6. Batched chess recognition
    # -----------------------------------------------------

    try:
        chess_predictor = get_predictor()

        raw_fen = predict_chessboard_batched(
            chess_predictor,
            temp_file_path,
        )

        clean_fen = fix_fen_format(
            raw_fen
        )

        if " " not in clean_fen:
            clean_fen += " w - - 0 1"

        return {
            "fen": clean_fen
        }

    except Exception as e:

        return {
            "error": str(e),
            "fen": "start",
        }

    finally:

        if os.path.exists(
            temp_file_path
        ):
            os.remove(
                temp_file_path
            )