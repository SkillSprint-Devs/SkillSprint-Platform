"""
SkillSprint AI Engine — Flask API
====================================
REST API that ties together the full AI pipeline:

    User Message
        ↓
    text_cleaner (preprocessing)
        ↓
    TF-IDF Vectorizer (feature extraction)
        ↓
    Logistic Regression (intent prediction)
        ↓
    IntentResolver (intents.json lookup)
        ↓
    Return: { intent, confidence, response, route, category }

Endpoints:
    POST /predict           — predict intent from user message
    GET  /health            — health check
    GET  /intents           — list all registered intents
    GET  /intents/<label>   — get metadata for a specific intent
    GET  /categories        — list all intent categories
    GET  /admin/summary     — admin analytics summary
    POST /feedback          — log failed/misclassified queries

Usage:
    cd ai_engine
    python app.py                  # runs on port 5050
    SET FLASK_PORT=5050 && python app.py

Docker:
    The ai_engine runs as a separate microservice.
    The Node.js backend proxies /api/ai/* → http://ai-engine:5050/*
"""

import os
import sys
import json
import pickle
import csv
from datetime import datetime

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if _BASE_DIR not in sys.path:
    sys.path.insert(0, _BASE_DIR)

from preprocessing.text_cleaner import clean_text
from semantic.intent_resolver import IntentResolver

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PORT           = int(os.environ.get("AI_ENGINE_PORT", 5050))
MODELS_DIR     = os.path.join(_BASE_DIR, "models")
DATASET_DIR    = os.path.join(_BASE_DIR, "dataset")
FAILED_CSV     = os.path.join(DATASET_DIR, "failed_queries.csv")

# Confidence threshold — below this, use semantic boosting
CONFIDENCE_THRESHOLD = 0.60


# ---------------------------------------------------------------------------
# Model Loading
# ---------------------------------------------------------------------------
_vectorizer = None
_classifier = None
_resolver   = None


def load_models():
    """Load trained model artifacts and intent resolver."""
    global _vectorizer, _classifier, _resolver

    vec_path = os.path.join(MODELS_DIR, "tfidf_vectorizer.pkl")
    clf_path = os.path.join(MODELS_DIR, "intent_classifier.pkl")

    if not os.path.exists(vec_path) or not os.path.exists(clf_path):
        print("[WARNING] Model files not found. Run training first:")
        print("  cd ai_engine && python -m training.train_model")
        return False

    with open(vec_path, "rb") as f:
        _vectorizer = pickle.load(f)
    with open(clf_path, "rb") as f:
        _classifier = pickle.load(f)

    _resolver = IntentResolver()

    print(f"[OK] Models loaded: {_vectorizer.n_features} features, "
          f"{len(_classifier.classes_)} classes, "
          f"{_resolver.intent_count} intents in registry")
    return True


# ---------------------------------------------------------------------------
# Prediction Core
# ---------------------------------------------------------------------------
def predict_intent(raw_text: str) -> dict:
    """
    Full prediction pipeline.

    Args:
        raw_text: Raw user message

    Returns:
        Dict with: intent, confidence, response, route, category,
        keywords, admin_notes, method
    """
    if not _vectorizer or not _classifier or not _resolver:
        return {
            "error": "Models not loaded. Run training first.",
            "intent": None,
            "confidence": 0.0,
        }

    # 1. Preprocess
    cleaned = clean_text(raw_text)

    if not cleaned:
        resolved = _resolver._fallback_response("empty_input")
        resolved["confidence"] = 0.0
        resolved["cleaned_text"] = ""
        resolved["method"] = "fallback"
        return resolved

    # 2. Vectorize
    X = _vectorizer.transform([cleaned])

    # 3. Predict with probabilities
    top_predictions = _classifier.predict_top_k(X[0], k=3)
    best_intent, best_confidence = top_predictions[0]

    # 4. Decide: ML prediction vs semantic boost
    method = "ml_primary"

    if best_confidence < CONFIDENCE_THRESHOLD:
        # Try semantic boosting from intents.json keywords
        boosted = _resolver.semantic_boost(cleaned, top_k=3)
        if boosted and boosted[0][1] > 0:
            # Combine ML + semantic signals
            ml_scores = {label: score for label, score in top_predictions}
            combined = {}
            for label, sem_score in boosted:
                ml_score = ml_scores.get(label, 0)
                combined[label] = 0.4 * ml_score + 0.6 * (sem_score / (boosted[0][1] or 1))
            for label, ml_score in ml_scores.items():
                if label not in combined:
                    combined[label] = 0.4 * ml_score

            best_intent = max(combined, key=combined.get)
            best_confidence = max(best_confidence, 0.45)  # adjusted confidence
            method = "hybrid_boosted"

    # 5. Resolve intent → response, route, category
    resolved = _resolver.resolve(best_intent)
    resolved["confidence"] = round(best_confidence, 4)
    resolved["cleaned_text"] = cleaned
    resolved["method"] = method
    resolved["alternatives"] = [
        {"intent": label, "confidence": round(score, 4)}
        for label, score in top_predictions[1:3]
    ]

    return resolved


# ---------------------------------------------------------------------------
# Failed Query Logging
# ---------------------------------------------------------------------------
def log_failed_query(raw_text: str, predicted_intent: str,
                     correct_intent: str = "", user_feedback: str = ""):
    """Log a failed or misclassified query for retraining."""
    try:
        file_exists = os.path.exists(FAILED_CSV) and os.path.getsize(FAILED_CSV) > 0
        with open(FAILED_CSV, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["timestamp", "raw_text", "predicted_intent",
                                 "correct_intent", "user_feedback"])
            writer.writerow([
                datetime.utcnow().isoformat(),
                raw_text,
                predicted_intent,
                correct_intent,
                user_feedback,
            ])
    except Exception as e:
        print(f"[ERROR] Failed to log query: {e}")


# ---------------------------------------------------------------------------
# Simple HTTP Server (stdlib only — no Flask dependency)
# ---------------------------------------------------------------------------
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import urllib.parse


class AIRequestHandler(BaseHTTPRequestHandler):
    """Lightweight REST API handler."""

    def _send_json(self, data: dict, status: int = 200):
        """Send a JSON response."""
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        """Read and parse JSON request body."""
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    # ── OPTIONS (CORS preflight) ──────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ── GET routes ────────────────────────────────────────────────────
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/health":
            self._handle_health()
        elif path == "/intents":
            self._handle_list_intents()
        elif path.startswith("/intents/"):
            label = path.replace("/intents/", "")
            self._handle_get_intent(label)
        elif path == "/categories":
            self._handle_categories()
        elif path == "/admin/summary":
            self._handle_admin_summary()
        else:
            self._send_json({"error": "Not found"}, 404)

    # ── POST routes ───────────────────────────────────────────────────
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/predict":
            self._handle_predict()
        elif path == "/feedback":
            self._handle_feedback()
        else:
            self._send_json({"error": "Not found"}, 404)

    # ── Handler implementations ───────────────────────────────────────

    def _handle_health(self):
        models_loaded = _vectorizer is not None and _classifier is not None
        self._send_json({
            "status":        "healthy" if models_loaded else "degraded",
            "models_loaded": models_loaded,
            "intents_count": _resolver.intent_count if _resolver else 0,
            "timestamp":     datetime.utcnow().isoformat(),
        })

    def _handle_predict(self):
        body = self._read_body()
        message = body.get("message", "").strip()

        if not message:
            self._send_json({"error": "Missing 'message' field"}, 400)
            return

        result = predict_intent(message)
        self._send_json(result)

    def _handle_list_intents(self):
        if not _resolver:
            self._send_json({"error": "Resolver not loaded"}, 503)
            return
        intents = _resolver.get_all_intents()
        self._send_json({"intents": intents, "count": len(intents)})

    def _handle_get_intent(self, label: str):
        if not _resolver:
            self._send_json({"error": "Resolver not loaded"}, 503)
            return
        result = _resolver.resolve(label)
        self._send_json(result)

    def _handle_categories(self):
        if not _resolver:
            self._send_json({"error": "Resolver not loaded"}, 503)
            return
        categories = _resolver.get_categories()
        summary = {cat: len(intents) for cat, intents in categories.items()}
        self._send_json({"categories": summary})

    def _handle_admin_summary(self):
        auth_header = self.headers.get("Authorization", "")
        if auth_header != "Bearer " + os.environ.get("ADMIN_TOKEN", "skillsprint_admin_secret"):
            self._send_json({"error": "Unauthorized. Invalid Admin Token."}, 401)
            return
            
        if not _resolver:
            self._send_json({"error": "Resolver not loaded"}, 503)
            return
        self._send_json(_resolver.admin_summary())

    def _handle_feedback(self):
        body = self._read_body()
        raw_text = body.get("message", "")
        predicted = body.get("predicted_intent", "")
        correct = body.get("correct_intent", "")
        feedback = body.get("feedback", "")

        if not raw_text:
            self._send_json({"error": "Missing 'message' field"}, 400)
            return

        log_failed_query(raw_text, predicted, correct, feedback)
        self._send_json({"status": "logged", "message": "Feedback recorded"})

    # ── Suppress default logs for cleaner output ──────────────────────
    def log_message(self, format, *args):
        print(f"  [{self.command}] {self.path} → {args[1] if len(args) > 1 else ''}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    print("=" * 60)
    print("  SkillSprint AI Engine")
    print("=" * 60)

    # Load models
    print("\nLoading models...")
    if not load_models():
        print("\n[!] Starting in degraded mode (no models).")
        print("    Train first: python -m training.train_model")

    # Start server
    server = ThreadingHTTPServer(("0.0.0.0", PORT), AIRequestHandler)
    print(f"\n  Server running on http://0.0.0.0:{PORT} (ThreadingHTTPServer)")
    print(f"  Endpoints:")
    print(f"    POST /predict         — predict intent")
    print(f"    GET  /health          — health check")
    print(f"    GET  /intents         — list all intents")
    print(f"    GET  /intents/<label> — get intent metadata")
    print(f"    GET  /categories      — list categories")
    print(f"    GET  /admin/summary   — admin analytics")
    print(f"    POST /feedback        — log failed queries")
    print(f"\n  Press Ctrl+C to stop.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Shutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
