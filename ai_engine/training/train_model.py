"""
SkillSprint AI Engine — Model Training Pipeline
=================================================
Trains a TF-IDF + Logistic Regression intent classifier and
evaluates it against the validation set.

Pipeline:
    train.csv → text_cleaner → TF-IDF Vectorizer → Logistic Regression
                                                     ↓
                                              models/intent_classifier.pkl
                                              models/tfidf_vectorizer.pkl

Usage:
    python -m training.train_model          # from ai_engine/
    python training/train_model.py          # direct

Outputs:
    models/intent_classifier.pkl   — trained Logistic Regression model
    models/tfidf_vectorizer.pkl    — fitted TF-IDF vectorizer
    models/label_encoder.pkl       — label → index mapping
    models/training_report.json    — metrics, confusion data, metadata
"""

import os
import sys
import json
import time
import csv
import pickle
import math
from collections import Counter, defaultdict

# ---------------------------------------------------------------------------
# Path setup — ensure ai_engine/ is importable
# ---------------------------------------------------------------------------
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BASE_DIR not in sys.path:
    sys.path.insert(0, _BASE_DIR)

from preprocessing.text_cleaner import clean_text, clean_batch

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
TRAIN_CSV      = os.path.join(_BASE_DIR, "dataset", "train.csv")
VALIDATION_CSV = os.path.join(_BASE_DIR, "dataset", "validation.csv")
MODELS_DIR     = os.path.join(_BASE_DIR, "models")

# Ensure models directory exists
os.makedirs(MODELS_DIR, exist_ok=True)


# ═══════════════════════════════════════════════════════════════════════════
# LIGHTWEIGHT IMPLEMENTATIONS (no sklearn dependency)
# ═══════════════════════════════════════════════════════════════════════════

class TfidfVectorizer:
    """
    Minimal TF-IDF vectorizer.

    Fits on a corpus of documents and transforms text into sparse
    TF-IDF feature vectors.
    """

    def __init__(self, max_features: int = 5000, ngram_range: tuple = (1, 2),
                 min_df: int = 2, sublinear_tf: bool = True):
        self.max_features = max_features
        self.ngram_range = ngram_range
        self.min_df = min_df
        self.sublinear_tf = sublinear_tf
        self.vocabulary_ = {}     # term → index
        self.idf_ = {}            # term → idf value
        self._fitted = False

    def _tokenize(self, text: str) -> list:
        """Generate n-gram tokens from text."""
        words = text.split()
        tokens = []
        for n in range(self.ngram_range[0], self.ngram_range[1] + 1):
            for i in range(len(words) - n + 1):
                tokens.append(" ".join(words[i:i + n]))
        return tokens

    def fit(self, documents: list):
        """Fit the vectorizer on a list of text documents."""
        n_docs = len(documents)
        doc_freq = Counter()   # term → number of documents containing it
        term_freq = Counter()  # term → total appearances (for feature selection)

        for doc in documents:
            tokens = self._tokenize(doc)
            unique_tokens = set(tokens)
            for t in unique_tokens:
                doc_freq[t] += 1
            for t in tokens:
                term_freq[t] += 1

        # Filter by min_df and select top max_features by frequency
        eligible = [
            (term, freq) for term, freq in term_freq.items()
            if doc_freq[term] >= self.min_df
        ]
        eligible.sort(key=lambda x: x[1], reverse=True)
        top_terms = [t for t, _ in eligible[:self.max_features]]

        self.vocabulary_ = {term: idx for idx, term in enumerate(top_terms)}

        # Compute IDF: log(N / (1 + df))  +1 smoothing
        self.idf_ = {}
        for term, idx in self.vocabulary_.items():
            df = doc_freq.get(term, 0)
            self.idf_[term] = math.log(n_docs / (1 + df)) + 1.0

        self._fitted = True
        return self

    def transform(self, documents: list) -> list:
        """Transform documents to TF-IDF vectors (list of dicts: index → value)."""
        if not self._fitted:
            raise RuntimeError("Vectorizer not fitted. Call fit() first.")

        result = []
        for doc in documents:
            tokens = self._tokenize(doc)
            tf = Counter()
            for t in tokens:
                if t in self.vocabulary_:
                    tf[t] += 1

            vec = {}
            doc_len = len(tokens) if tokens else 1
            for term, count in tf.items():
                idx = self.vocabulary_[term]
                # Use raw count for sublinear tf
                tf_val = count
                if self.sublinear_tf and tf_val > 0:
                    tf_val = 1 + math.log(tf_val)
                # Apply document length normalization and IDF
                vec[idx] = (tf_val / doc_len) * self.idf_[term]

            # L2 normalize
            norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
            vec = {k: v / norm for k, v in vec.items()}
            result.append(vec)

        return result

    def fit_transform(self, documents: list) -> list:
        self.fit(documents)
        return self.transform(documents)

    @property
    def n_features(self):
        return len(self.vocabulary_)

    def to_dict(self):
        return {
            "max_features": self.max_features,
            "ngram_range": list(self.ngram_range),
            "min_df": self.min_df,
            "sublinear_tf": self.sublinear_tf,
            "vocabulary_": self.vocabulary_,
            "idf_": self.idf_,
            "_fitted": self._fitted
        }

    @classmethod
    def from_dict(cls, d):
        inst = cls(
            max_features=d["max_features"],
            ngram_range=tuple(d["ngram_range"]),
            min_df=d["min_df"],
            sublinear_tf=d["sublinear_tf"]
        )
        inst.vocabulary_ = d["vocabulary_"]
        inst.idf_ = d["idf_"]
        inst._fitted = d["_fitted"]
        return inst


class LogisticRegressionOVR:
    """
    Multinomial Logistic Regression via One-vs-Rest with SGD.

    Each class gets a binary weight vector.  Prediction picks the
    class with the highest decision score.
    """

    def __init__(self, n_features: int = 0, lr: float = 0.1,
                 epochs: int = 50, C: float = 1.0):
        self.n_features = n_features
        self.lr = lr
        self.epochs = epochs
        self.C = C                   # regularization strength
        self.classes_ = []
        self.weights_ = {}           # class → {feature_idx: weight}
        self.biases_ = {}            # class → bias

    def _sigmoid(self, z):
        # Numerically stable sigmoid
        if z >= 0:
            return 1.0 / (1.0 + math.exp(-z))
        else:
            ez = math.exp(z)
            return ez / (1.0 + ez)

    def _dot(self, w: dict, x: dict) -> float:
        """Sparse dot product."""
        total = 0.0
        for k, v in x.items():
            if k in w:
                total += w[k] * v
        return total

    def fit(self, X: list, y: list):
        """
        Train OVR logistic regression.

        Args:
            X: list of sparse vectors (dicts: feature_idx → value)
            y: list of class labels (strings)
        """
        self.classes_ = sorted(set(y))
        n_samples = len(X)

        for cls in self.classes_:
            # Binary labels for this class
            binary_y = [1.0 if label == cls else 0.0 for label in y]

            w = {}   # sparse weights
            b = 0.0

            for epoch in range(self.epochs):
                # Learning rate decay
                current_lr = self.lr / (1 + 0.01 * epoch)

                for i in range(n_samples):
                    xi = X[i]
                    yi = binary_y[i]

                    z = self._dot(w, xi) + b
                    pred = self._sigmoid(z)
                    error = pred - yi

                    # Update weights (SGD with L2 regularization)
                    for k, v in xi.items():
                        if k not in w:
                            w[k] = 0.0
                        w[k] -= current_lr * (error * v + w[k] / (self.C * n_samples))

                    b -= current_lr * error

            self.weights_[cls] = w
            self.biases_[cls] = b

    def predict(self, X: list) -> list:
        """Predict class labels for a list of sparse vectors."""
        return [self._predict_one(x) for x in X]

    def _predict_one(self, x: dict) -> str:
        """Predict a single sample."""
        best_cls = self.classes_[0]
        best_score = float('-inf')

        for cls in self.classes_:
            score = self._dot(self.weights_[cls], x) + self.biases_[cls]
            if score > best_score:
                best_score = score
                best_cls = cls

        return best_cls

    def predict_proba(self, X: list) -> list:
        """
        Predict probability distributions over classes.

        Returns list of dicts: { class_label: probability }
        """
        results = []
        for x in X:
            scores = {}
            for cls in self.classes_:
                scores[cls] = self._dot(self.weights_[cls], x) + self.biases_[cls]

            # Softmax normalization
            max_score = max(scores.values())
            exp_scores = {cls: math.exp(s - max_score) for cls, s in scores.items()}
            total = sum(exp_scores.values()) or 1.0
            proba = {cls: exp_s / total for cls, exp_s in exp_scores.items()}
            results.append(proba)

        return results

    def predict_top_k(self, x: dict, k: int = 3) -> list:
        """
        Predict top-k classes for a single sample.

        Returns: list of (class_label, probability) tuples
        """
        proba = self.predict_proba([x])[0]
        sorted_proba = sorted(proba.items(), key=lambda p: p[1], reverse=True)
        return sorted_proba[:k]

    def to_dict(self):
        serialized_weights = {}
        for cls_label, w_dict in self.weights_.items():
            serialized_weights[cls_label] = {str(k): v for k, v in w_dict.items()}
        return {
            "n_features": self.n_features,
            "lr": self.lr,
            "epochs": self.epochs,
            "C": self.C,
            "classes_": self.classes_,
            "weights_": serialized_weights,
            "biases_": self.biases_
        }

    @classmethod
    def from_dict(cls, d):
        inst = cls(
            n_features=d["n_features"],
            lr=d["lr"],
            epochs=d["epochs"],
            C=d["C"]
        )
        inst.classes_ = d["classes_"]
        inst.biases_ = d["biases_"]
        deserialized_weights = {}
        for cls_label, w_dict in d["weights_"].items():
            deserialized_weights[cls_label] = {int(k): v for k, v in w_dict.items()}
        inst.weights_ = deserialized_weights
        return inst


# ═══════════════════════════════════════════════════════════════════════════
# DATA LOADING
# ═══════════════════════════════════════════════════════════════════════════

def load_csv(filepath: str) -> tuple:
    """Load a CSV with columns: text, intent."""
    texts = []
    labels = []

    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            text = row.get("text", "").strip()
            intent = row.get("intent", "").strip()
            if text and intent:
                texts.append(text)
                labels.append(intent)

    return texts, labels


# ═══════════════════════════════════════════════════════════════════════════
# EVALUATION
# ═══════════════════════════════════════════════════════════════════════════

def evaluate(y_true: list, y_pred: list) -> dict:
    """
    Compute per-class precision, recall, F1, and overall accuracy.
    """
    classes = sorted(set(y_true + y_pred))
    correct = sum(1 for t, p in zip(y_true, y_pred) if t == p)
    accuracy = correct / len(y_true) if y_true else 0.0

    # Per-class metrics
    tp = Counter()
    fp = Counter()
    fn = Counter()

    for t, p in zip(y_true, y_pred):
        if t == p:
            tp[t] += 1
        else:
            fp[p] += 1
            fn[t] += 1

    per_class = {}
    for cls in classes:
        precision = tp[cls] / (tp[cls] + fp[cls]) if (tp[cls] + fp[cls]) > 0 else 0.0
        recall = tp[cls] / (tp[cls] + fn[cls]) if (tp[cls] + fn[cls]) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
        support = sum(1 for t in y_true if t == cls)
        per_class[cls] = {
            "precision": round(precision, 4),
            "recall":    round(recall, 4),
            "f1":        round(f1, 4),
            "support":   support,
        }

    # Macro averages
    macro_precision = sum(m["precision"] for m in per_class.values()) / len(classes) if classes else 0.0
    macro_recall    = sum(m["recall"] for m in per_class.values()) / len(classes) if classes else 0.0
    macro_f1        = sum(m["f1"] for m in per_class.values()) / len(classes) if classes else 0.0

    return {
        "accuracy":        round(accuracy, 4),
        "macro_precision": round(macro_precision, 4),
        "macro_recall":    round(macro_recall, 4),
        "macro_f1":        round(macro_f1, 4),
        "per_class":       per_class,
        "total_samples":   len(y_true),
        "correct":         correct,
    }


# ═══════════════════════════════════════════════════════════════════════════
# TRAINING PIPELINE
# ═══════════════════════════════════════════════════════════════════════════

def train():
    """
    Full training pipeline:
    1. Load train.csv + validation.csv
    2. Preprocess all text
    3. Fit TF-IDF vectorizer
    4. Train Logistic Regression
    5. Evaluate on validation set
    6. Save model artifacts
    """
    print("=" * 60)
    print("  SkillSprint AI — Training Pipeline")
    print("=" * 60)

    start_time = time.time()

    # ── 1. Load Data ──────────────────────────────────────────────────
    print("\n[1/6] Loading datasets...")
    train_texts, train_labels = load_csv(TRAIN_CSV)
    val_texts, val_labels = load_csv(VALIDATION_CSV)

    print(f"  Train:      {len(train_texts)} samples, "
          f"{len(set(train_labels))} intents")
    print(f"  Validation: {len(val_texts)} samples, "
          f"{len(set(val_labels))} intents")

    # ── 2. Preprocess ─────────────────────────────────────────────────
    print("\n[2/6] Preprocessing text...")
    train_clean = clean_batch(train_texts)
    val_clean   = clean_batch(val_texts)

    if train_texts:
        print(f"  '{train_texts[0]}' -> '{train_clean[0]}'")
    if len(train_texts) > 1:
        print(f"  '{train_texts[-1]}' -> '{train_clean[-1]}'")

    # ── 3. Vectorize ──────────────────────────────────────────────────
    print("\n[3/6] Fitting TF-IDF vectorizer...")
    vectorizer = TfidfVectorizer(
        max_features=5000,
        ngram_range=(1, 2),
        min_df=1,
        sublinear_tf=True,
    )
    X_train = vectorizer.fit_transform(train_clean)
    X_val   = vectorizer.transform(val_clean)

    print(f"  Vocabulary size: {vectorizer.n_features} features")

    # ── 4. Train ──────────────────────────────────────────────────────
    print("\n[4/6] Training Logistic Regression classifier...")
    classifier = LogisticRegressionOVR(
        n_features=vectorizer.n_features,
        lr=0.15,
        epochs=60,
        C=1.0,
    )
    classifier.fit(X_train, train_labels)
    print(f"  Classes: {len(classifier.classes_)}")

    # ── 5. Evaluate ───────────────────────────────────────────────────
    print("\n[5/6] Evaluating on validation set...")
    train_pred = classifier.predict(X_train)
    val_pred   = classifier.predict(X_val)

    train_metrics = evaluate(train_labels, train_pred)
    val_metrics   = evaluate(val_labels, val_pred)

    print(f"\n  TRAIN  Accuracy: {train_metrics['accuracy']:.2%}  "
          f"Macro-F1: {train_metrics['macro_f1']:.4f}")
    print(f"  VAL    Accuracy: {val_metrics['accuracy']:.2%}  "
          f"Macro-F1: {val_metrics['macro_f1']:.4f}")

    # Show per-class validation results
    print(f"\n  Per-class validation results:")
    print(f"  {'Intent':<40s} {'Prec':>6s} {'Rec':>6s} {'F1':>6s} {'N':>4s}")
    print(f"  {'-'*40} {'-'*6} {'-'*6} {'-'*6} {'-'*4}")
    for cls, m in sorted(val_metrics["per_class"].items()):
        print(f"  {cls:<40s} {m['precision']:>6.2f} {m['recall']:>6.2f} "
              f"{m['f1']:>6.2f} {m['support']:>4d}")

    # ── 6. Save ───────────────────────────────────────────────────────
    print("\n[6/6] Saving model artifacts...")

    # Vectorizer
    vec_path = os.path.join(MODELS_DIR, "tfidf_vectorizer.json")
    with open(vec_path, "w", encoding="utf-8") as f:
        json.dump(vectorizer.to_dict(), f, indent=2)
    print(f"  Saved: {vec_path}")

    # Classifier
    clf_path = os.path.join(MODELS_DIR, "intent_classifier.json")
    with open(clf_path, "w", encoding="utf-8") as f:
        json.dump(classifier.to_dict(), f, indent=2)
    print(f"  Saved: {clf_path}")

    # Label encoder (class list for reference)
    le_path = os.path.join(MODELS_DIR, "label_encoder.json")
    with open(le_path, "w", encoding="utf-8") as f:
        json.dump(classifier.classes_, f, indent=2)
    print(f"  Saved: {le_path}")

    # Training report
    elapsed = round(time.time() - start_time, 2)
    report = {
        "training_time_seconds": elapsed,
        "train_samples":   len(train_texts),
        "val_samples":     len(val_texts),
        "n_classes":       len(classifier.classes_),
        "n_features":      vectorizer.n_features,
        "train_accuracy":  train_metrics["accuracy"],
        "train_macro_f1":  train_metrics["macro_f1"],
        "val_accuracy":    val_metrics["accuracy"],
        "val_macro_f1":    val_metrics["macro_f1"],
        "val_per_class":   val_metrics["per_class"],
        "hyperparameters": {
            "max_features":  5000,
            "ngram_range":   [1, 2],
            "min_df":        1,
            "sublinear_tf":  True,
            "learning_rate": 0.15,
            "epochs":        60,
            "C":             1.0,
        },
        "classes": classifier.classes_,
    }
    report_path = os.path.join(MODELS_DIR, "training_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"  Saved: {report_path}")

    print(f"\n{'=' * 60}")
    print(f"  Training complete in {elapsed}s")
    print(f"  Validation accuracy: {val_metrics['accuracy']:.2%}")
    print(f"{'=' * 60}")

    return vectorizer, classifier, val_metrics


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    train()
