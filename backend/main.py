import os
import io
import re
import tempfile
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from chessimg2pos import predict_fen
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

def fix_fen_format(raw_fen: str) -> str:
    board_part = raw_fen.split(" ")[0]
    rows = board_part.split('/')
    compressed_rows = []
    for row in rows:
        comp_row = re.sub(r'(1+)', lambda m: str(len(m.group(1))), row)
        compressed_rows.append(comp_row)
    return '/'.join(compressed_rows)

@app.post("/extract-click")
async def extract_click(
    x: float = Form(...),
    y: float = Form(...),
    image: UploadFile = File(...)
):
    contents = await image.read()
    
    # 1. Load image into OpenCV
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 2. Find contours (geometric shapes)
    thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
    contours, _ = cv2.findContours(thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    
    candidates = []
    for cnt in contours:
        cx, cy, cw, ch = cv2.boundingRect(cnt)
        aspect = cw / float(ch)
        
        # Look for squares large enough to be a chessboard (filters out individual squares)
        if 0.90 <= aspect <= 1.10 and cw > 150:
            # The square must contain the exact (x, y) coordinate the user clicked
            if cx <= x <= cx + cw and cy <= y <= cy + ch:
                candidates.append((cw * ch, cx, cy, cw, ch))
                
    if not candidates:
        return {"error": "Could not auto-detect a chessboard boundary at that click location.", "fen": "start"}
        
    # 3. Sort by area (Ascending). 
    # By picking the smallest valid bounding box, we strip away outer margins and coordinate text!
    candidates.sort(key=lambda item: item[0])
    _, bx, by, bw, bh = candidates[0]
    
    # 4. Crop the image to exactly the 64-square grid
    cropped_cv = img[by:by+bh, bx:bx+bw]
    
    # Convert OpenCV image back to PIL for our ML pipeline
    cropped_rgb = cv2.cvtColor(cropped_cv, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(cropped_rgb)
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_file:
        pil_img = pil_img.resize((400, 400)) 
        pil_img = pil_img.convert("L")       
        enhancer = ImageEnhance.Contrast(pil_img)
        pil_img = enhancer.enhance(1.8)  
        pil_img = pil_img.convert("RGB")     
        
        pil_img.save("debug_crop.png", format="PNG")
        pil_img.save(temp_file.name, format="PNG")
        temp_file_path = temp_file.name

    try:
        raw_fen = predict_fen(temp_file_path)
        os.remove(temp_file_path)
        
        clean_fen = fix_fen_format(raw_fen)
        if " " not in clean_fen:
            clean_fen += " w - - 0 1"
            
        return {"fen": clean_fen}
    except Exception as e:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        return {"error": str(e), "fen": "start"}