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
FAILED_JSON    = os.path.join(DATASET_DIR, "failed_queries.json")
TRAIN_CSV      = os.path.join(DATASET_DIR, "train.csv")
JS_INTENTS_PATH = os.path.join(DATASET_DIR, "js_intents.json")

# Confidence thresholds
CONFIDENCE_THRESHOLD_LOG = 0.65
CONFIDENCE_THRESHOLD_FALLBACK = 0.45

# ---------------------------------------------------------------------------
# Pre-routing heuristic — JS keyword signals
# ---------------------------------------------------------------------------
# If the cleaned user query contains any of these tokens, the engine will
# attempt the JS resolver first (before ML classification), reducing
# misclassification for JavaScript questions.
_JS_SIGNAL_TOKENS = {
    "javascript", "js", "closure", "closures", "prototype", "hoisting",
    "hoist", "async", "await", "promise", "promises", "callback",
    "callbacks", "arrow", "destructuring", "spread", "rest",
    "generator", "iterator", "symbol", "proxy", "reflect",
    "typeof", "coercion", "fetch", "dom", "event loop", "eventloop",
    "microtask", "macrotask", "currying", "curry", "higher order",
    "template literal", "localStorage", "localstorage", "regex",
    "map set", "weakmap", "weakset", "es6", "es2015", "ecmascript",
}


# ---------------------------------------------------------------------------
# Model Loading
# ---------------------------------------------------------------------------
_vectorizer  = None
_classifier  = None
_resolver    = None   # platform intents
_js_resolver = None   # javascript knowledge layer


def load_models():
    """Load trained model artifacts and both intent resolvers."""
    global _vectorizer, _classifier, _resolver, _js_resolver

    vec_path = os.path.join(MODELS_DIR, "tfidf_vectorizer.pkl")
    clf_path = os.path.join(MODELS_DIR, "intent_classifier.pkl")

    if not os.path.exists(vec_path) or not os.path.exists(clf_path):
        print("[WARNING] Model files not found. Run training first:")
        print("  cd ai_engine && python -m training.train_model")
        return False

    with open(vec_path, "rb") as f:
        # Pickle workaround for classes trained in __main__
        import sys
        try:
            from training.train_model import TfidfVectorizer, LogisticRegressionOVR
            sys.modules['__main__'].TfidfVectorizer = TfidfVectorizer
            sys.modules['__main__'].LogisticRegressionOVR = LogisticRegressionOVR
        except ImportError:
            pass
        _vectorizer = pickle.load(f)
    with open(clf_path, "rb") as f:
        _classifier = pickle.load(f)

    # Platform resolver (intents.json)
    _resolver = IntentResolver()

    # JavaScript knowledge resolver (js_intents.json)
    if os.path.exists(JS_INTENTS_PATH):
        _js_resolver = IntentResolver(intents_path=JS_INTENTS_PATH)
        print(f"[OK] JS resolver loaded: {_js_resolver.intent_count} JS intents")
    else:
        print("[WARNING] js_intents.json not found — JS knowledge layer disabled.")

    print(f"[OK] Models loaded: {_vectorizer.n_features} features, "
          f"{len(_classifier.classes_)} classes, "
          f"{_resolver.intent_count} platform intents")
    return True


# ---------------------------------------------------------------------------
# Prediction Core
# ---------------------------------------------------------------------------
def _detect_js_signals(cleaned_text: str) -> bool:
    """
    Pre-routing heuristic: check if the cleaned query contains
    JavaScript-specific signal tokens before running ML classification.
    Returns True if JS resolver should be tried first.
    """
    tokens = set(cleaned_text.lower().split())
    return bool(tokens & _JS_SIGNAL_TOKENS)


def _resolve_by_tier(intent_label: str, cleaned: str):
    """
    Route an intent label to the correct resolver tier:
      - js.*        → JS knowledge resolver
      - platform.*  → Platform intent resolver
      - anything else → platform resolver (which has fallback)
    """
    if intent_label.startswith("js.") and _js_resolver:
        resolved = _js_resolver.resolve(intent_label)
        # Enrich the response with the code_example field if present
        # (stored in the raw intents data, not surfaced by resolve())
        resolved["code_example"] = _js_resolver._intents.get(
            intent_label, {}
        ).get("code_example", None)
        resolved["topic_level"] = _js_resolver._intents.get(
            intent_label, {}
        ).get("topic_level", "")
        resolved["response_type"] = _js_resolver._intents.get(
            intent_label, {}
        ).get("response_type", "explanation")
        resolved["domain"] = "javascript"
        return resolved
    else:
        resolved = _resolver.resolve(intent_label)
        resolved["domain"] = "platform"
        return resolved


def predict_intent(raw_text: str) -> dict:
    """
    Full prediction pipeline — two-tier resolution.

    Tier 1 (pre-routing heuristic):
        If the query contains JS signal tokens, try the JS resolver
        via semantic_boost first. This catches high-confidence JS
        questions before ML even runs.

    Tier 2 (ML + semantic fallback):
        Standard TF-IDF + Logistic Regression pipeline, followed by
        hybrid semantic boosting if confidence is low.

    Tier routing (after ML):
        js.*       → _js_resolver  (JavaScript knowledge)
        platform.* → _resolver     (Platform help)

    Args:
        raw_text: Raw user message

    Returns:
        Dict with: intent, confidence, response, route, category,
        keywords, admin_notes, code_example, domain, method
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
        resolved["domain"] = "platform"
        return resolved

    # 2. Pre-routing heuristic — JS signal detection
    if _js_resolver and _detect_js_signals(cleaned):
        js_boosted = _js_resolver.semantic_boost(cleaned, top_k=3)
        if js_boosted and js_boosted[0][1] > 0.5:  # threshold for heuristic confidence
            best_intent  = js_boosted[0][0]
            best_confidence = min(0.80, 0.50 + js_boosted[0][1] * 0.1)  # scaled synthetic confidence
            resolved = _resolve_by_tier(best_intent, cleaned)
            resolved["confidence"] = round(best_confidence, 4)
            resolved["cleaned_text"] = cleaned
            resolved["method"] = "js_heuristic_boost"
            resolved["alternatives"] = [
                {"intent": label, "confidence": round(score, 4)}
                for label, score in js_boosted[1:3]
            ]
            return resolved

    # 3. Vectorize
    X = _vectorizer.transform([cleaned])

    # 4. Predict with probabilities
    top_predictions = _classifier.predict_top_k(X[0], k=3)
    best_intent, best_confidence = top_predictions[0]

    # 5. Decide: ML prediction vs semantic boost
    method = "ml_primary"

    if best_confidence < CONFIDENCE_THRESHOLD_LOG:
        # Try semantic boosting — search BOTH resolvers
        platform_boosted = _resolver.semantic_boost(cleaned, top_k=3)
        js_boosted       = _js_resolver.semantic_boost(cleaned, top_k=3) if _js_resolver else []

        all_boosted = platform_boosted + js_boosted
        if all_boosted:
            # Sort combined results by score
            all_boosted.sort(key=lambda x: x[1], reverse=True)
            top_boost_intent, top_boost_score = all_boosted[0]

            if top_boost_score > 0:
                # Combine ML + semantic signals
                ml_scores = {label: score for label, score in top_predictions}
                combined = {}
                for label, sem_score in all_boosted[:5]:
                    ml_score = ml_scores.get(label, 0)
                    combined[label] = 0.4 * ml_score + 0.6 * (sem_score / (top_boost_score or 1))
                for label, ml_score in ml_scores.items():
                    if label not in combined:
                        combined[label] = 0.4 * ml_score

                best_intent     = max(combined, key=combined.get)
                best_confidence = max(best_confidence, 0.45)
                method = "hybrid_boosted"

    # 6. Log low-confidence predictions
    if best_confidence < CONFIDENCE_THRESHOLD_LOG:
        log_failed_query(raw_text, best_intent, float(best_confidence))

    if best_confidence < CONFIDENCE_THRESHOLD_FALLBACK:
        resolved = _resolver.resolve("platform.unknown.fallback")
        resolved["confidence"] = round(best_confidence, 4)
        resolved["cleaned_text"] = cleaned
        resolved["method"] = "fallback_low_confidence"
        resolved["domain"] = "platform"
        resolved["alternatives"] = [
            {"intent": label, "confidence": round(score, 4)}
            for label, score in top_predictions[:3]
        ]
        return resolved

    # 7. Resolve intent → response via correct tier
    resolved = _resolve_by_tier(best_intent, cleaned)
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
import uuid

def log_failed_query(raw_text: str, predicted_intent: str, confidence: float, resolved_status: bool = False):
    """Log a failed or misclassified query for retraining to JSON."""
    try:
        data = []
        if os.path.exists(FAILED_JSON) and os.path.getsize(FAILED_JSON) > 0:
            with open(FAILED_JSON, "r", encoding="utf-8") as f:
                data = json.load(f)
        
        new_entry = {
            "id": f"fq_{uuid.uuid4().hex[:8]}",
            "query": raw_text,
            "predicted_intent": predicted_intent,
            "assigned_intent": "",
            "confidence": round(confidence, 4),
            "resolved": resolved_status,
            "added_to_dataset": False,
            "reviewed_by": "",
            "reviewed_at": "",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        data.append(new_entry)
        
        with open(FAILED_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[ERROR] Failed to log query to JSON: {e}")


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
        elif path == "/admin/failed_queries":
            self._handle_failed_queries()
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
        elif path == "/admin/add_to_dataset":
            self._handle_add_to_dataset()
        elif path == "/admin/retrain":
            self._handle_retrain()
        else:
            self._send_json({"error": "Not found"}, 404)

    # ── Handler implementations ───────────────────────────────────────

    def _handle_health(self):
        models_loaded = _vectorizer is not None and _classifier is not None
        self._send_json({
            "status":             "healthy" if models_loaded else "degraded",
            "models_loaded":      models_loaded,
            "platform_intents":   _resolver.intent_count if _resolver else 0,
            "js_intents":         _js_resolver.intent_count if _js_resolver else 0,
            "js_resolver_active": _js_resolver is not None,
            "timestamp":          datetime.utcnow().isoformat(),
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

    def _handle_failed_queries(self):
        auth_header = self.headers.get("Authorization", "")
        if auth_header != "Bearer " + os.environ.get("ADMIN_TOKEN", "skillsprint_admin_secret"):
            self._send_json({"error": "Unauthorized. Invalid Admin Token."}, 401)
            return
            
        data = []
        if os.path.exists(FAILED_JSON):
            with open(FAILED_JSON, "r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError:
                    pass
        self._send_json({"failed_queries": data})

    def _handle_add_to_dataset(self):
        auth_header = self.headers.get("Authorization", "")
        if auth_header != "Bearer " + os.environ.get("ADMIN_TOKEN", "skillsprint_admin_secret"):
            self._send_json({"error": "Unauthorized. Invalid Admin Token."}, 401)
            return
            
        body = self._read_body()
        query_id = body.get("id")
        intent = body.get("intent")
        
        if not query_id or not intent:
            self._send_json({"error": "Missing id or intent"}, 400)
            return
            
        # Update JSON and CSV
        if os.path.exists(FAILED_JSON):
            with open(FAILED_JSON, "r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError:
                    data = []
                    
            query_text = ""
            for item in data:
                if item.get("id") == query_id:
                    item["added_to_dataset"] = True
                    item["resolved"] = True
                    item["assigned_intent"] = intent
                    item["reviewed_by"] = "admin"
                    item["reviewed_at"] = datetime.utcnow().isoformat() + "Z"
                    query_text = item.get("query", "")
                    break
            
            with open(FAILED_JSON, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
                
            # Append to train.csv
            if query_text:
                with open(TRAIN_CSV, "a", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow([query_text, intent])
                    
                self._send_json({"status": "success", "message": f"Added '{query_text}' to dataset as '{intent}'"})
            else:
                self._send_json({"error": "Query ID not found"}, 404)
        else:
            self._send_json({"error": "Failed queries file not found"}, 404)

    def _handle_retrain(self):
        auth_header = self.headers.get("Authorization", "")
        if auth_header != "Bearer " + os.environ.get("ADMIN_TOKEN", "skillsprint_admin_secret"):
            self._send_json({"error": "Unauthorized. Invalid Admin Token."}, 401)
            return
            
        try:
            import subprocess
            train_script = os.path.join(_BASE_DIR, "training", "train_model.py")
            process = subprocess.run(
                [sys.executable, train_script], 
                capture_output=True, text=True, cwd=_BASE_DIR
            )
            
            if process.returncode != 0:
                self._send_json({"error": "Retraining failed", "details": process.stderr}, 500)
                return
                
            # Reload models
            load_models()
            
            self._send_json({"status": "success", "message": "Model retrained and reloaded successfully"})
        except Exception as e:
            self._send_json({"error": "Retraining error", "details": str(e)}, 500)

    def _handle_feedback(self):
        body = self._read_body()
        raw_text = body.get("message", "")
        predicted = body.get("predicted_intent", "")
        confidence = body.get("confidence", 0.0)

        if not raw_text:
            self._send_json({"error": "Missing 'message' field"}, 400)
            return

        log_failed_query(raw_text, predicted, confidence)
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
    print(f"    GET  /admin/failed_queries — list failed queries")
    print(f"    POST /admin/add_to_dataset — add failed query to train.csv")
    print(f"    POST /admin/retrain   — trigger model retraining")
    print(f"    POST /feedback        — log failed queries")
    print(f"\n  Press Ctrl+C to stop.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Shutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
