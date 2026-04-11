"""
SignSense AR Backend Server — Final Build
Flask + SocketIO backend with:
  * Hybrid ISL recognition:
    - Trained HOG model (from Kaggle dataset) on segmented hand region
    - Trained Landmark model (if available) on MediaPipe landmarks
    - Heuristic fallback if no models trained
  * Hand landmark emission for frontend skeleton drawing
  * IP Webcam proxy to avoid CORS
  * Text -> ISL processing with spaCy NLP
  * Avatar animation control
"""

import os
import math
import cv2
import numpy as np
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_socketio import SocketIO, emit
import base64
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode
import threading
import time
from datetime import datetime
import logging
import nltk
import spacy
import re
import requests
from flask_cors import CORS

try:
    import joblib
    JOBLIB_AVAILABLE = True
except ImportError:
    JOBLIB_AVAILABLE = False

# ─── APP SETUP ────────────────────────────────────────────────────────────────

app = Flask(__name__)
app.config['SECRET_KEY'] = 'signsense_ar_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── MEDIAPIPE ────────────────────────────────────────────────────────────────

HAND_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'hand_landmarker.task')
try:
    hand_options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=HAND_MODEL_PATH),
        running_mode=RunningMode.IMAGE,
        num_hands=1,
        min_hand_detection_confidence=0.6,
        min_hand_presence_confidence=0.6,
        min_tracking_confidence=0.6
    )
    hand_landmarker = HandLandmarker.create_from_options(hand_options)
    logger.info("MediaPipe HandLandmarker initialized")
except Exception as e:
    logger.error(f"Failed to init HandLandmarker: {e}")
    hand_landmarker = None

# ─── TRAINED MODELS ──────────────────────────────────────────────────────────

RF_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'isl_rf_model.pkl')
RF_LABELS_PATH = os.path.join(os.path.dirname(__file__), 'isl_label_encoder.pkl')

hog_model = None
landmark_model = None
rf_labels = None
IMG_SIZE = 64

if JOBLIB_AVAILABLE and os.path.exists(RF_MODEL_PATH) and os.path.exists(RF_LABELS_PATH):
    try:
        models_dict = joblib.load(RF_MODEL_PATH)
        rf_labels = joblib.load(RF_LABELS_PATH)

        if isinstance(models_dict, dict):
            hog_model = models_dict.get('hog_model')
            landmark_model = models_dict.get('landmark_model')
            IMG_SIZE = models_dict.get('img_size', 64)
        else:
            # Old format: single model
            hog_model = models_dict

        logger.info(f"Models loaded - HOG: {hog_model is not None}, Landmark: {landmark_model is not None}")
        logger.info(f"Classes ({len(rf_labels)}): {rf_labels}")
    except Exception as e:
        logger.error(f"Failed to load models: {e}")
else:
    logger.warning("No trained models found. Run train_isl_model.py first. Using heuristic fallback.")

# ─── SPACY ────────────────────────────────────────────────────────────────────

try:
    nlp = spacy.load("en_core_web_sm")
    logger.info("spaCy loaded")
except:
    nlp = None

try:
    nltk.download('punkt', quiet=True)
    nltk.download('averaged_perceptron_tagger', quiet=True)
except:
    pass

# ─── TEXT PROCESSING ──────────────────────────────────────────────────────────

CONTRACTIONS = {
    "i'm": "i am", "you're": "you are", "he's": "he is", "she's": "she is",
    "it's": "it is", "we're": "we are", "they're": "they are",
    "i've": "i have", "you've": "you have", "we've": "we have", "they've": "they have",
    "i'll": "i will", "you'll": "you will", "he'll": "he will", "she'll": "she will",
    "we'll": "we will", "they'll": "they will", "it'll": "it will",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "haven't": "have not", "hasn't": "has not", "hadn't": "had not",
    "won't": "will not", "wouldn't": "would not", "don't": "do not", "doesn't": "does not",
    "didn't": "did not", "can't": "cannot", "couldn't": "could not", "shouldn't": "should not",
}

def expand_contractions(text):
    pattern = re.compile(r'\b(' + '|'.join(re.escape(k) for k in CONTRACTIONS) + r')\b', re.IGNORECASE)
    def repl(m):
        w = m.group(0).lower()
        exp = CONTRACTIONS.get(w, w)
        return exp.capitalize() if m.group(0)[0].isupper() else exp
    return pattern.sub(repl, text)

def preprocess_text(text):
    text = text.lower().strip()
    text = expand_contractions(text)
    text = re.sub(r'\b(\d{1,2}):00\b', r'\1', text)
    text = re.sub(r'\b(\d{1,2}):(\d{1,2})\b', r'\1 \2', text)
    text = re.sub(r'[^\w\s]', '', text)
    return text

def extract_isl_structure_spacy(text):
    if not nlp: return text
    doc = nlp(text)
    words = []
    tense = ""
    keep = {"left","right","back","straight","forward","up","down","near","next","beside","in","on","under","from","to"}
    for t in doc:
        if t.text.lower() in keep:
            words.append(t.text.lower()); continue
        if t.pos_ == "AUX" and t.lemma_ in ["be","do","have","will"]:
            if t.lemma_ == "will": tense = "FUTURE"
            continue
        if t.pos_ in ["DET","ADP"]: continue
        if t.tag_ in ["VBD","VBN"]: tense = "PAST"
        words.append(t.lemma_)
    if tense: words.append(tense)
    return " ".join(words) if words else text


# ─── HOG FEATURE EXTRACTION ──────────────────────────────────────────────────

def compute_hog_from_roi(roi_img, size=None):
    """Extract HOG features from a hand ROI image."""
    if size is None:
        size = IMG_SIZE
    img = cv2.resize(roi_img, (size, size))
    if len(img.shape) == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    win_size = (size, size)
    cell_size = (8, 8)
    block_size = (16, 16)
    block_stride = (8, 8)
    nbins = 9
    hog = cv2.HOGDescriptor(win_size, block_size, block_stride, cell_size, nbins)
    features = hog.compute(img)
    return features.flatten()


# ─── UTILITY ──────────────────────────────────────────────────────────────────

def _dist(a, b):
    return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2)

def _angle(a, b, c):
    ba = (a[0]-b[0], a[1]-b[1])
    bc = (c[0]-b[0], c[1]-b[1])
    dot = ba[0]*bc[0] + ba[1]*bc[1]
    mag = math.sqrt(ba[0]**2+ba[1]**2) * math.sqrt(bc[0]**2+bc[1]**2)
    if mag == 0: return 0
    return math.degrees(math.acos(max(-1, min(1, dot/mag))))


# ─── SIGN LANGUAGE PROCESSOR ─────────────────────────────────────────────────

class SignLanguageProcessor:
    """
    Hybrid recognizer with priority:
    1. Landmark ML model (if trained + landmarks available)
    2. HOG ML model (if trained + hand detected)
    3. Heuristic fallback
    """

    def __init__(self):
        self.current_prediction = ""
        self.confidence = 0.0
        self.hand_detected = False
        self.prediction_history = []
        self.max_history = 12   # larger buffer = more stable output
        self.last_landmarks = None

    def process_frame(self, frame):
        try:
            if hand_landmarker is None:
                return self._result("HandLandmarker not loaded", 0)

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = hand_landmarker.detect(mp_image)

            self.hand_detected = bool(result.hand_landmarks)
            if not self.hand_detected:
                self.last_landmarks = None
                return self._result("No hand detected", 0)

            h, w, _ = frame.shape
            lm = result.hand_landmarks[0]
            pts = [[p.x * w, p.y * h] for p in lm]
            self.last_landmarks = [[p.x, p.y] for p in lm]

            # Try recognition methods in priority order
            letter, conf = None, 0

            # Priority 1: Landmark ML model
            if landmark_model is not None and rf_labels is not None:
                letter, conf = self._recognise_landmark_ml(lm)

            # Priority 2: HOG ML model (extract hand ROI from frame)
            # Threshold raised to 0.55 — HOG was trained on studio images,
            # webcam footage looks very different so low-confidence HOG is misleading.
            if (letter is None or conf < 0.55) and hog_model is not None and rf_labels is not None:
                hog_letter, hog_conf = self._recognise_hog(frame, lm, h, w)
                if hog_conf > conf:
                    letter, conf = hog_letter, hog_conf

            # Priority 3: Heuristic (geometric rules — most reliable for webcam)
            h_letter, h_conf = self._recognise_heuristic(pts)
            # Use heuristic if it is more confident OR if ML confidence is still low
            if h_conf > 0 and (letter is None or conf < 0.55 or h_conf > conf):
                letter, conf = h_letter, h_conf

            if letter is None or letter == '?':
                letter = '?'
                conf = 0.1

            # Only add to history if we have a real prediction
            if letter != '?':
                self.prediction_history.append(letter)
            if len(self.prediction_history) > self.max_history:
                self.prediction_history.pop(0)

            if not self.prediction_history:
                return self._result('...', 0)

            smoothed = max(set(self.prediction_history), key=self.prediction_history.count)
            stability = self.prediction_history.count(smoothed) / len(self.prediction_history)

            # Require 57% consensus — at least 7/12 frames must agree
            if stability < 0.57:
                smoothed = self.current_prediction or '...'

            self.current_prediction = smoothed
            self.confidence = conf * stability

            return self._result(smoothed, round(self.confidence * 100, 1))

        except Exception as e:
            logger.error(f"process_frame: {e}")
            return self._result("Error", 0)

    def _result(self, word, confidence):
        return {
            "word": word,
            "confidence": confidence,
            "emotion": "neutral",
            "landmarks": self.last_landmarks
        }

    # ── LANDMARK ML ───────────────────────────────────────────────────
    def _recognise_landmark_ml(self, lm):
        try:
            wrist_x, wrist_y = lm[0].x, lm[0].y
            vec = []
            for p in lm:
                vec.append(p.x - wrist_x)
                vec.append(p.y - wrist_y)
            X = np.array([vec])
            proba = landmark_model.predict_proba(X)[0]
            idx = np.argmax(proba)
            return rf_labels[idx], proba[idx]
        except Exception as e:
            logger.debug(f"Landmark ML error: {e}")
            return None, 0

    # ── HOG ML ────────────────────────────────────────────────────────
    def _recognise_hog(self, frame, lm, h, w):
        try:
            # Extract hand bounding box from landmarks
            xs = [p.x * w for p in lm]
            ys = [p.y * h for p in lm]
            pad = 30
            x1 = max(0, int(min(xs)) - pad)
            y1 = max(0, int(min(ys)) - pad)
            x2 = min(w, int(max(xs)) + pad)
            y2 = min(h, int(max(ys)) + pad)

            roi = frame[y1:y2, x1:x2]
            if roi.size == 0:
                return None, 0

            features = compute_hog_from_roi(roi)
            X = np.array([features])
            proba = hog_model.predict_proba(X)[0]
            idx = np.argmax(proba)
            return rf_labels[idx], proba[idx]
        except Exception as e:
            logger.debug(f"HOG ML error: {e}")
            return None, 0

    # ── HEURISTIC ─────────────────────────────────────────────────────
    def _finger_ext(self, pts, tip, pip, mcp, thumb=False):
        """Detect whether a finger is extended."""
        if thumb:
            # Thumb: extended if tip is further from wrist horizontally than MCP joint
            return abs(pts[tip][0] - pts[0][0]) > abs(pts[mcp][0] - pts[0][0]) * 1.1
        # Non-thumb: tip must be clearly above the PIP joint (lower Y = higher on screen)
        return pts[tip][1] < pts[pip][1]

    def _fingers(self, pts):
        return {
            'thumb':  self._finger_ext(pts, 4, 3, 2, thumb=True),
            'index':  self._finger_ext(pts, 8, 7, 5),
            'middle': self._finger_ext(pts, 12, 11, 9),
            'ring':   self._finger_ext(pts, 16, 15, 13),
            'pinky':  self._finger_ext(pts, 20, 19, 17),
        }

    def _recognise_heuristic(self, pts):
        """
        Strict, ordered, non-overlapping ISL letter recognition.
        Rules are ordered from most-specific to least-specific to avoid
        misclassification from overlapping conditions.
        """
        f = self._fingers(pts)
        n = sum(f.values())  # number of extended fingers

        # Hand size = wrist-to-middle-MCP distance (normalization reference)
        hs = _dist(pts[0], pts[9]) or 1

        def d(i, j):   return _dist(pts[i], pts[j]) / hs
        def touch(i, j, t=0.5): return d(i, j) < t

        # ── 0 fingers extended ────────────────────────────────────────
        if n == 0:
            # E: all curled, thumb tucked under fingers (tip_y > MCP_y)
            if pts[4][1] > pts[5][1]:
                return 'E', 0.82
            # A: all curled, thumb beside fist (tip is to the side)
            if f['thumb']:
                return 'A', 0.84
            # S: tight fist, thumb over fingers
            return 'S', 0.78

        # ── 5 fingers extended ────────────────────────────────────────
        if n == 5:
            return 'B', 0.70   # open hand — loose B

        # ── pinky only ────────────────────────────────────────────────
        # I: only pinky extended
        if f['pinky'] and not f['index'] and not f['middle'] and not f['ring']:
            # Y if thumb also out and spread
            if f['thumb'] and d(4, 20) > 0.7:
                return 'Y', 0.90
            return 'I', 0.90

        # ── thumb + pinky ─────────────────────────────────────────────
        # Y: thumb out + pinky out, rest closed
        if f['thumb'] and f['pinky'] and not f['index'] and not f['middle'] and not f['ring']:
            return 'Y', 0.92

        # ── 4 fingers up (B / W variants) ─────────────────────────────
        # B: all 4 + thumb folded in (fingers close together)
        if f['index'] and f['middle'] and f['ring'] and f['pinky'] and not f['thumb']:
            return 'B', 0.90

        # W: index + middle + ring up, pinky down
        if f['index'] and f['middle'] and f['ring'] and not f['pinky']:
            return 'W', 0.88

        # ── F: index+thumb pinch, three fingers up ─────────────────────
        if touch(4, 8, 0.45) and f['middle'] and f['ring'] and f['pinky']:
            return 'F', 0.90

        # ── O: thumb+index form circle, all others closed ─────────────
        if touch(4, 8, 0.50) and not f['middle'] and not f['ring'] and not f['pinky']:
            return 'O', 0.85

        # ── L: index + thumb form L, rest closed ──────────────────────
        if f['index'] and f['thumb'] and not f['middle'] and not f['ring'] and not f['pinky']:
            angle_l = _angle(pts[4], pts[2], pts[8])
            if angle_l > 50:
                return 'L', 0.90

        # ── index only (no thumb) ──────────────────────────────────────
        if f['index'] and not f['middle'] and not f['ring'] and not f['pinky'] and not f['thumb']:
            ix = abs(pts[8][0] - pts[5][0])
            iy = abs(pts[8][1] - pts[5][1])
            # G: index points sideways (horizontal)
            if ix > iy * 1.0:
                return 'G', 0.82
            # D: index points up + thumb touches middle
            if touch(4, 12, 0.55) or touch(4, 9, 0.60):
                return 'D', 0.85
            # X: index is hooked/bent (tip below mid-joint)
            if pts[8][1] > pts[7][1]:
                return 'X', 0.80
            # pointing up — default to D
            return 'D', 0.70

        # ── index + middle (the tricky group: H K P R U V) ────────────
        if f['index'] and f['middle'] and not f['ring'] and not f['pinky']:
            ix_i  = abs(pts[8][0]  - pts[5][0])
            iy_i  = abs(pts[8][1]  - pts[5][1])
            im_spread = d(8, 12)   # spread between index-tip and middle-tip

            # P: both fingers point downward (tips below their MCP bases)
            if pts[8][1] > pts[5][1] and pts[12][1] > pts[9][1]:
                return 'P', 0.80

            # H: both fingers horizontal (both x-displacement > y-displacement)
            if ix_i > iy_i * 0.9 and not f['thumb']:
                return 'H', 0.82

            # K: thumb pokes up between index and middle
            if f['thumb'] and pts[4][1] < pts[9][1]:
                return 'K', 0.82

            # R: index crossed OVER middle (index tip is to the side of middle tip)
            cross = pts[8][0] - pts[12][0]    # positive = index further right
            if abs(cross) > 0.1 * hs and im_spread < 0.4:
                return 'R', 0.83

            # U: both fingers together (small spread)
            if im_spread < 0.35:
                return 'U', 0.87

            # V: fingers spread apart
            if im_spread >= 0.35:
                return 'V', 0.87

        # ── C: curved (all fingers partially curled, C-shape gap) ─────
        if not f['index'] and not f['pinky']:
            if d(4, 8) > 0.5 and pts[4][1] < pts[8][1]:
                return 'C', 0.76

        # ── Fallback ──────────────────────────────────────────────────
        return '?', 0.0


# ─── INIT ─────────────────────────────────────────────────────────────────────

sign_processor = SignLanguageProcessor()

class AvatarController:
    def __init__(self):
        self.connected = False
    def connect_avatar(self):
        self.connected = True
        return True
    def animate_text(self, text):
        if not self.connected: return False
        try:
            skip = {'A','AN','THE','AND','OR','BUT','IN','ON','AT','TO','FOR'}
            processed = ' '.join(w for w in text.upper().split() if w not in skip)
            socketio.emit('avatar_animation', {'text': processed, 'timestamp': datetime.now().isoformat()})
            return True
        except:
            return False

avatar_controller = AvatarController()


# ─── ROUTES ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('../', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('../', filename)

@app.route('/api/status')
def api_status():
    return jsonify({
        'status': 'online',
        'hog_model': hog_model is not None,
        'landmark_model': landmark_model is not None,
        'model_classes': rf_labels if rf_labels else [],
        'avatar_connected': avatar_controller.connected,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/process_text', methods=['POST'])
def process_text_endpoint():
    try:
        data = request.get_json()
        text = data.get('text', '')
        if not text: return jsonify({'error': 'No text'}), 400
        processed = preprocess_text(text)
        isl = extract_isl_structure_spacy(processed)
        return jsonify({'original_text': text, 'processed_text': processed, 'isl_structure': isl})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/translate', methods=['POST'])
def translate_text():
    try:
        data = request.get_json()
        text = data.get('text', '')
        if not text: return jsonify({'error': 'No text'}), 400
        processed = preprocess_text(text)
        isl = extract_isl_structure_spacy(processed)
        ok = avatar_controller.animate_text(isl)
        return jsonify({'success': ok, 'original': text, 'isl_structure': isl})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ip_webcam_snapshot')
def ip_webcam_snapshot():
    url = request.args.get('url', '')
    if not url: return jsonify({'error': 'No URL'}), 400

    # Normalize: IP Webcam app only supports HTTP, not HTTPS.
    # Auto-correct https:// -> http:// to avoid SSL errors.
    base = url.rstrip('/')
    if base.startswith('https://'):
        base = 'http://' + base[len('https://'):]
        logger.info(f"Auto-corrected URL: https -> http => {base}")

    snap_url = base + '/shot.jpg'
    try:
        resp = requests.get(snap_url, timeout=5, verify=False)
        if resp.status_code == 200:
            return Response(resp.content, mimetype='image/jpeg')
        # Also try /video instead of /shot.jpg
        video_url = base + '/video'
        resp2 = requests.get(video_url, timeout=5, stream=True, verify=False)
        if resp2.status_code == 200:
            # Return first chunk as frame
            chunk = next(resp2.iter_content(chunk_size=65536), None)
            if chunk:
                return Response(chunk, mimetype='image/jpeg')
        return jsonify({'error': f'HTTP {resp.status_code}'}), 502
    except Exception as e:
        logger.error(f"IP Webcam snapshot error for {snap_url}: {e}")
        return jsonify({'error': str(e)}), 502


# ─── SOCKETIO ─────────────────────────────────────────────────────────────────

@socketio.on('connect')
def handle_connect():
    logger.info('Client connected')
    emit('status', {
        'message': 'Connected to SignSense server',
        'ml_model': hog_model is not None or landmark_model is not None
    })
    if not avatar_controller.connected:
        avatar_controller.connect_avatar()

@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Client disconnected')

@socketio.on('video_frame')
def handle_video_frame(data):
    try:
        image_data = base64.b64decode(data['image'].split(',')[1])
        nparr = np.frombuffer(image_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is not None:
            result = sign_processor.process_frame(frame)
            emit('predictions', result)
            emit('hand_status', {
                'detected': sign_processor.hand_detected,
                'timestamp': datetime.now().isoformat()
            })
    except Exception as e:
        logger.error(f"Frame error: {e}")

@socketio.on('avatar_command')
def handle_avatar_command(data):
    try:
        if data.get('command') == 'animate':
            text = data.get('text', '')
            ok = avatar_controller.animate_text(text)
            emit('avatar_response', {'success': ok, 'text': text})
    except Exception as e:
        logger.error(f"Avatar cmd error: {e}")


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    logger.info("=" * 50)
    logger.info("SignSense AR Backend Starting...")
    logger.info(f"  HOG Model: {'LOADED' if hog_model else 'NOT FOUND'}")
    logger.info(f"  Landmark Model: {'LOADED' if landmark_model else 'NOT FOUND'}")
    logger.info(f"  Classes: {rf_labels if rf_labels else 'N/A (using heuristic)'}")
    logger.info("=" * 50)
    avatar_controller.connect_avatar()
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)

if __name__ == '__main__':
    main()
