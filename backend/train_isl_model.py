"""
SignSense — ISL Model Trainer (v2)
Trains on the Kaggle ISL dataset which contains grayscale hand gesture images.
Uses scikit-learn Random Forest on HOG (Histogram of Oriented Gradients) features
extracted from resized images. This is fast, accurate, and doesn't need GPU.

Usage:
    python train_isl_model.py
"""

import os
import sys
import cv2
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import time

# ─── CONFIG ────────────────────────────────────────────────────────────────────

OUTPUT_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'isl_rf_model.pkl')
OUTPUT_LABELS_PATH = os.path.join(os.path.dirname(__file__), 'isl_label_encoder.pkl')
IMG_SIZE = 64  # Resize images to 64x64, then extract HOG

# ─── DOWNLOAD DATASET ─────────────────────────────────────────────────────────

def download_dataset():
    """Download ISL dataset from Kaggle using kagglehub."""
    try:
        import kagglehub
        print("[1/5] Downloading ISL dataset from Kaggle...")
        path = kagglehub.dataset_download("kshitij192/isl-dataset")
        print(f"  -> Downloaded to: {path}")
        return path
    except ImportError:
        print("ERROR: kagglehub not installed. Run: pip install kagglehub")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR downloading dataset: {e}")
        sys.exit(1)


def find_train_dir(base_path):
    """Find the 'train' directory inside the dataset."""
    for root, dirs, files in os.walk(base_path):
        if 'train' in dirs:
            return os.path.join(root, 'train')
    return base_path


# ─── EXTRACT HOG FEATURES ─────────────────────────────────────────────────────

def compute_hog(image, size=IMG_SIZE):
    """Compute HOG (Histogram of Oriented Gradients) features from an image."""
    # Resize
    img = cv2.resize(image, (size, size))

    # Convert to grayscale if needed
    if len(img.shape) == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # HOG parameters
    win_size = (size, size)
    cell_size = (8, 8)
    block_size = (16, 16)
    block_stride = (8, 8)
    nbins = 9

    hog = cv2.HOGDescriptor(win_size, block_size, block_stride, cell_size, nbins)
    features = hog.compute(img)
    return features.flatten()


def extract_features(dataset_path, max_per_class=300):
    """Extract HOG features from all images in the dataset."""
    print("[2/5] Extracting HOG features from images...")

    train_dir = find_train_dir(dataset_path)
    print(f"  -> Train directory: {train_dir}")

    # List class directories
    class_dirs = sorted([
        d for d in os.listdir(train_dir)
        if os.path.isdir(os.path.join(train_dir, d))
    ])

    print(f"  -> Found {len(class_dirs)} classes: {class_dirs}")

    features = []
    labels = []
    total_processed = 0
    total_skipped = 0

    for class_name in class_dirs:
        class_path = os.path.join(train_dir, class_name)
        image_files = [
            f for f in os.listdir(class_path)
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.webp'))
        ]

        # Limit per class for balanced training
        selected = image_files[:max_per_class]
        class_count = 0

        for img_file in selected:
            img_path = os.path.join(class_path, img_file)
            try:
                img = cv2.imread(img_path)
                if img is None:
                    total_skipped += 1
                    continue

                hog_features = compute_hog(img)
                features.append(hog_features)
                labels.append(class_name.upper())
                class_count += 1
                total_processed += 1

            except Exception as e:
                total_skipped += 1
                continue

        print(f"    Class '{class_name.upper()}': {class_count} images processed")

    print(f"  -> Total: {total_processed} samples, {total_skipped} skipped")
    return np.array(features), np.array(labels)


# ─── ALSO BUILD MEDIAPIPE LANDMARK MODEL FROM LIVE DATA ───────────────────────

def build_landmark_dataset():
    """
    Also build a dataset by running MediaPipe on images where it CAN detect hands.
    This is used alongside HOG for real-time recognition.
    We'll try loading from a secondary real-hand dataset if available.
    """
    print("[3/5] Building supplementary landmark features...")

    # Try to find the main dataset's original color images
    try:
        import kagglehub
        import mediapipe as mp_module
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode

        HAND_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'hand_landmarker.task')
        if not os.path.exists(HAND_MODEL_PATH):
            print("  -> hand_landmarker.task not found, skipping landmark dataset")
            return None, None

        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=HAND_MODEL_PATH),
            running_mode=RunningMode.IMAGE,
            num_hands=1,
            min_hand_detection_confidence=0.3,  # Lower threshold
            min_hand_presence_confidence=0.3,
        )
        landmarker = HandLandmarker.create_from_options(options)

        # Try downloading a real-hand ISL dataset
        try:
            path2 = kagglehub.dataset_download("prathumarikeri/indian-sign-language-isl")
            print(f"  -> Secondary dataset downloaded: {path2}")
        except Exception:
            print("  -> Secondary dataset not available, skipping landmarks")
            return None, None

        # Find image folders
        train_dir2 = find_train_dir(path2)
        if not os.path.exists(train_dir2):
            # Try direct path
            train_dir2 = path2

        class_dirs = sorted([
            d for d in os.listdir(train_dir2)
            if os.path.isdir(os.path.join(train_dir2, d))
        ])

        if len(class_dirs) < 5:
            print(f"  -> Not enough classes in secondary dataset ({len(class_dirs)})")
            return None, None

        features = []
        labels_list = []
        total = 0

        for cls in class_dirs:
            cls_path = os.path.join(train_dir2, cls)
            imgs = [f for f in os.listdir(cls_path) if f.lower().endswith(('.png', '.jpg', '.jpeg'))][:100]
            cls_count = 0

            for img_file in imgs:
                try:
                    frame = cv2.imread(os.path.join(cls_path, img_file))
                    if frame is None:
                        continue
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    mp_image = mp_module.Image(image_format=mp_module.ImageFormat.SRGB, data=rgb)
                    result = landmarker.detect(mp_image)

                    if not result.hand_landmarks:
                        continue

                    lm = result.hand_landmarks[0]
                    wrist_x = lm[0].x
                    wrist_y = lm[0].y
                    vec = []
                    for p in lm:
                        vec.append(p.x - wrist_x)
                        vec.append(p.y - wrist_y)

                    features.append(vec)
                    labels_list.append(cls.upper())
                    cls_count += 1
                    total += 1
                except:
                    continue

            if cls_count > 0:
                print(f"    Landmark class '{cls.upper()}': {cls_count} samples")

        landmarker.close()

        if total > 50:
            print(f"  -> Landmark dataset: {total} samples")
            return np.array(features), np.array(labels_list)
        else:
            print(f"  -> Too few landmark samples ({total}), skipping")
            return None, None

    except Exception as e:
        print(f"  -> Landmark extraction failed: {e}")
        return None, None


# ─── TRAIN MODEL ──────────────────────────────────────────────────────────────

def train_model(X, y, model_name="HOG"):
    """Train a Random Forest classifier."""
    print(f"[4/5] Training Random Forest ({model_name})...")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"  -> Training: {len(X_train)}, Test: {len(X_test)}")
    print(f"  -> Classes: {len(set(y))}, Features: {X.shape[1]}")

    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=30,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
        class_weight='balanced'
    )

    start = time.time()
    clf.fit(X_train, y_train)
    elapsed = time.time() - start
    print(f"  -> Training done in {elapsed:.1f}s")

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\n  ** {model_name} Test Accuracy: {acc * 100:.1f}% **\n")

    # Show top/bottom performing classes
    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    class_scores = {k: v['f1-score'] for k, v in report.items() if len(k) <= 2}
    sorted_scores = sorted(class_scores.items(), key=lambda x: x[1], reverse=True)
    print("  Top 5 classes:", [(c, f"{s:.2f}") for c, s in sorted_scores[:5]])
    print("  Bottom 5 classes:", [(c, f"{s:.2f}") for c, s in sorted_scores[-5:]])
    print()

    return clf, acc


# ─── SAVE ─────────────────────────────────────────────────────────────────────

def save_models(hog_model, landmark_model, classes):
    """Save models."""
    print("[5/5] Saving models...")

    # Save main HOG model  
    models_dict = {
        'hog_model': hog_model,
        'landmark_model': landmark_model,
        'img_size': IMG_SIZE,
    }
    joblib.dump(models_dict, OUTPUT_MODEL_PATH)
    print(f"  -> Models saved to: {OUTPUT_MODEL_PATH}")

    unique_classes = sorted(set(classes))
    joblib.dump(unique_classes, OUTPUT_LABELS_PATH)
    print(f"  -> Labels saved to: {OUTPUT_LABELS_PATH} ({len(unique_classes)} classes)")


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  SignSense ISL Model Trainer v2")
    print("  (HOG Features + Optional Landmark Features)")
    print("=" * 60)
    print()

    # 1: Download
    dataset_path = download_dataset()

    # 2: Extract HOG features from grayscale images
    X_hog, y_hog = extract_features(dataset_path)
    if len(X_hog) < 50:
        print("ERROR: Too few HOG samples. Check dataset.")
        sys.exit(1)

    # 3: Try to build landmark dataset from secondary source
    X_lm, y_lm = build_landmark_dataset()

    # 4: Train HOG model
    hog_model, hog_acc = train_model(X_hog, y_hog, "HOG")

    # 4b: Train landmark model if available
    landmark_model = None
    if X_lm is not None and len(X_lm) > 50:
        landmark_model, lm_acc = train_model(X_lm, y_lm, "Landmark")

    # 5: Save
    save_models(hog_model, landmark_model, y_hog)

    print()
    print("=" * 60)
    print("  DONE! Models ready for SignSense backend.")
    print(f"  HOG model accuracy: {hog_acc*100:.1f}%")
    if landmark_model:
        print(f"  Landmark model accuracy: {lm_acc*100:.1f}%")
    print("  Start backend: python app.py")
    print("=" * 60)


if __name__ == '__main__':
    main()
