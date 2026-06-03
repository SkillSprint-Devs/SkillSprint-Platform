"""
SkillSprint AI Engine — Intent Resolver
========================================
The bridge between ML prediction and user-facing response.

Loads intents.json (the response routing layer) and resolves a
predicted intent label into:
  - response    (text reply)
  - route       (frontend page to redirect)
  - category    (analytics grouping)
  - keywords    (semantic boosting terms)
  - admin_notes (internal documentation)

Also supports:
  - Keyword-based semantic boosting (fallback when ML confidence is low)
  - Fallback response generation
  - Category-level aggregation for admin dashboards

Usage:
    from semantic.intent_resolver import IntentResolver

    resolver = IntentResolver()
    result   = resolver.resolve("platform.session.join")
    # → { response: "...", route: "/dashboard/live-sessions", ... }

    boosted  = resolver.semantic_boost("join meeting room", top_k=3)
    # → ["platform.session.join", "platform.session.create", ...]
"""

import json
import os
import math
from collections import Counter


# ---------------------------------------------------------------------------
# Path to intents.json (relative to ai_engine/)
# ---------------------------------------------------------------------------
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_INTENTS_PATH = os.path.join(_BASE_DIR, "dataset", "intents.json")


class IntentResolver:
    """
    Loads intents.json and provides resolution + semantic boosting.
    """

    def __init__(self, intents_path: str = None):
        self._path = intents_path or _INTENTS_PATH
        self._intents = {}
        self._keyword_index = {}          # keyword → [intent_label, ...]
        self._category_index = {}         # category → [intent_label, ...]
        self._load()

    # ── Load & Index ──────────────────────────────────────────────────────

    def _load(self):
        """Load intents.json and build inverted indexes."""
        if not os.path.exists(self._path):
            raise FileNotFoundError(f"intents.json not found at {self._path}")

        with open(self._path, "r", encoding="utf-8") as f:
            self._intents = json.load(f)

        # Build keyword → intents inverted index
        self._keyword_index = {}
        self._category_index = {}

        for intent_label, meta in self._intents.items():
            # Keyword index
            for kw in meta.get("keywords", []):
                kw_lower = kw.lower()
                if kw_lower not in self._keyword_index:
                    self._keyword_index[kw_lower] = []
                self._keyword_index[kw_lower].append(intent_label)

            # Category index
            category = meta.get("category", "Uncategorized")
            if category not in self._category_index:
                self._category_index[category] = []
            self._category_index[category].append(intent_label)

    # ── Core Resolution ───────────────────────────────────────────────────

    def resolve(self, intent_label: str) -> dict:
        """
        Resolve a predicted intent label to its full metadata.

        Args:
            intent_label: e.g. "platform.session.join"

        Returns:
            Dict with keys: intent, response, route, category,
            keywords, admin_notes.  Returns fallback if unknown.
        """
        if intent_label in self._intents:
            meta = self._intents[intent_label]
            return {
                "intent":      intent_label,
                "response":    meta.get("response", ""),
                "route":       meta.get("route", ""),
                "category":    meta.get("category", ""),
                "keywords":    meta.get("keywords", []),
                "admin_notes": meta.get("admin_notes", ""),
                "resolved":    True,
            }

        return self._fallback_response(intent_label)

    def _fallback_response(self, intent_label: str) -> dict:
        """Generate a graceful fallback when intent is not in the registry."""
        return {
            "intent":      intent_label,
            "response":    (
                "I'm not sure how to help with that specific request. "
                "Try rephrasing, or open the full AI workspace for more "
                "detailed help."
            ),
            "route":       "",
            "category":    "Unknown",
            "keywords":    [],
            "admin_notes": f"Unregistered intent: {intent_label}",
            "resolved":    False,
        }

    # ── Semantic Boosting ─────────────────────────────────────────────────

    def semantic_boost(self, query: str, top_k: int = 3) -> list:
        """
        Keyword-based semantic boosting.  When ML confidence is low,
        use this to find intents whose keywords overlap with the query.

        Uses TF-IDF-style scoring: a keyword that appears in fewer
        intents gets a higher weight (IDF), and exact matches score
        higher than partial ones.

        Args:
            query:  cleaned user input string
            top_k:  number of top matching intents to return

        Returns:
            List of (intent_label, score) tuples, sorted by score desc.
        """
        query_tokens = set(query.lower().split())
        scores = Counter()

        total_intents = len(self._intents)

        for token in query_tokens:
            for kw, intent_list in self._keyword_index.items():
                kw_tokens = set(kw.split())
                # Exact match or token is one of the keyword words
                if token == kw or token in kw_tokens:
                    # IDF weight: rarer keywords count more
                    idf = math.log(total_intents / (1 + len(intent_list)))
                    weight = 1.0 if token == kw else 0.5  # exact vs partial
                    for intent_label in intent_list:
                        scores[intent_label] += weight * idf

        return scores.most_common(top_k)

    # ── Accessors ─────────────────────────────────────────────────────────

    def get_all_intents(self) -> list:
        """Return list of all registered intent labels."""
        return list(self._intents.keys())

    def get_categories(self) -> dict:
        """Return category → [intent_labels] mapping."""
        return dict(self._category_index)

    def get_intents_by_category(self, category: str) -> list:
        """Get all intents under a specific category."""
        return self._category_index.get(category, [])

    def get_all_keywords(self) -> dict:
        """Return keyword → [intent_labels] inverted index."""
        return dict(self._keyword_index)

    def get_route(self, intent_label: str) -> str:
        """Quick accessor for just the route."""
        meta = self._intents.get(intent_label, {})
        return meta.get("route", "")

    def get_response(self, intent_label: str) -> str:
        """Quick accessor for just the response text."""
        meta = self._intents.get(intent_label, {})
        return meta.get("response", "")

    @property
    def intent_count(self) -> int:
        return len(self._intents)

    @property
    def category_count(self) -> int:
        return len(self._category_index)

    # ── Admin / Debug ─────────────────────────────────────────────────────

    def admin_summary(self) -> dict:
        """
        Generate a summary for admin analytics / panel discussion.

        Returns:
            Dict with stats suitable for an admin dashboard.
        """
        return {
            "total_intents":    self.intent_count,
            "total_categories": self.category_count,
            "categories": {
                cat: len(intents)
                for cat, intents in self._category_index.items()
            },
            "total_keywords":   len(self._keyword_index),
            "intents_with_admin_notes": sum(
                1 for m in self._intents.values() if m.get("admin_notes")
            ),
        }


# ---------------------------------------------------------------------------
# CLI test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    resolver = IntentResolver()

    print("=" * 60)
    print("SkillSprint Intent Resolver — Diagnostics")
    print("=" * 60)

    summary = resolver.admin_summary()
    print(f"\n  Total intents:    {summary['total_intents']}")
    print(f"  Total categories: {summary['total_categories']}")
    print(f"  Total keywords:   {summary['total_keywords']}")
    print(f"  With admin notes: {summary['intents_with_admin_notes']}")

    print(f"\n  Category breakdown:")
    for cat, count in summary["categories"].items():
        print(f"    {cat}: {count} intents")

    print(f"\n  Sample resolution:")
    test_intents = [
        "platform.session.join",
        "platform.quiz.unlocks",
        "platform.wallet.balance",
        "platform.unknown.test",
    ]
    for label in test_intents:
        result = resolver.resolve(label)
        status = "✓" if result["resolved"] else "✗"
        print(f"    {status} {label}")
        print(f"      → {result['response'][:80]}...")
        print(f"      → route: {result['route']}")
        print()

    print(f"  Semantic boost for 'join meeting room':")
    for intent, score in resolver.semantic_boost("join meeting room", top_k=5):
        print(f"    {intent}: {score:.3f}")
