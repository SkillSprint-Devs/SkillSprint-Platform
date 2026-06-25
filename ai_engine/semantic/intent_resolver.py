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
from semantic.context_engine import ContextEngine
from semantic.context_providers import ContextProvider
from preprocessing.text_cleaner import clean_text as _clean_kw


# ---------------------------------------------------------------------------
# Path to intents.json (relative to ai_engine/)
# ---------------------------------------------------------------------------
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_INTENTS_PATH  = os.path.join(_BASE_DIR, "dataset", "intents.json")
_SYNONYMS_PATH = os.path.join(_BASE_DIR, "dataset", "synonyms.json")


class IntentResolver:
    """
    Loads intents.json + synonyms.json and provides resolution + semantic boosting.

    Synonym Expansion:
        When a user query token matches a synonym in synonyms.json, it is
        transparently expanded to its canonical form before keyword matching.
        Example: "coach" → "mentor", "tutor" → "mentor"
    """

    def __init__(self, intents_path: str = None, synonyms_path: str = None):
        self._path          = intents_path or _INTENTS_PATH
        self._synonyms_path = synonyms_path or _SYNONYMS_PATH
        self._intents        = {}
        self._keyword_index  = {}   # keyword → [intent_label, ...]
        self._category_index = {}   # category → [intent_label, ...]
        self._synonym_map    = {}   # synonym_token → canonical_keyword
        self._kb_index       = {}
        self.context_engine  = ContextEngine()
        self.context_provider = ContextProvider()
        
        self._load()
        self._load_synonyms()
        self._load_kb_index()

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
            # Keyword index — store CLEANED (stemmed) keyword tokens so they
            # match the stemmed query tokens produced by text_cleaner.
            for kw in meta.get("keywords", []):
                # Clean each word of a multi-word keyword individually so that
                # "lexical scope" → ["lexic", "scope"] rather than one phrase.
                for word in kw.lower().split():
                    stemmed = _clean_kw(word)   # returns stemmed token string
                    if not stemmed:
                        continue
                    kw_lower = stemmed   # use stemmed form as the index key
                    if kw_lower not in self._keyword_index:
                        self._keyword_index[kw_lower] = []
                    if intent_label not in self._keyword_index[kw_lower]:
                        self._keyword_index[kw_lower].append(intent_label)

            # Category index
            category = meta.get("category", "Uncategorized")
            if category not in self._category_index:
                self._category_index[category] = []
            self._category_index[category].append(intent_label)

    def _load_synonyms(self):
        """
        Load synonyms.json and build a flat reverse lookup:
            synonym_token → canonical_keyword

        Example entry in synonyms.json:
            "mentor": ["coach", "teacher", "guide", "trainer"]

        Builds:
            { "coach": "mentor", "teacher": "mentor", "guide": "mentor", ... }
        """
        self._synonym_map = {}
        if not os.path.exists(self._synonyms_path):
            return  # Graceful degradation — synonyms are optional

        with open(self._synonyms_path, "r", encoding="utf-8") as f:
            raw = json.load(f)

        for canonical, synonyms in raw.items():
            if canonical.startswith("_"):  # skip meta keys
                continue
            for syn in synonyms:
                # Store each synonym word mapped back to its canonical
                syn_lower = syn.strip().lower()
                if syn_lower and syn_lower not in self._synonym_map:
                    self._synonym_map[syn_lower] = canonical.lower()

    def _expand_tokens(self, tokens: set) -> set:
        """
        Expand a set of query tokens by resolving synonyms to their
        canonical forms. Both the original token AND its canonical
        equivalent are included for maximum coverage.

        Example:
            {"coach"} → {"coach", "mentor"}
        """
        expanded = set(tokens)
        for token in tokens:
            canonical = self._synonym_map.get(token)
            if canonical:
                expanded.add(canonical)
        return expanded

    def _load_kb_index(self):
        """Load the knowledge_base registry index and dynamically scan javascript directory."""
        kb_index_path = os.path.join(_BASE_DIR, "knowledge_base", "index.json")
        if os.path.exists(kb_index_path):
            with open(kb_index_path, "r", encoding="utf-8") as f:
                self._kb_index = json.load(f)

        # Recursively scan javascript folder to automatically index files
        js_dir = os.path.join(_BASE_DIR, "knowledge_base", "javascript")
        if os.path.exists(js_dir):
            for root, _, files in os.walk(js_dir):
                for file in files:
                    if file.endswith(".json") and file != "index.json":
                        full_path = os.path.join(root, file)
                        try:
                            with open(full_path, "r", encoding="utf-8") as f_in:
                                kb_data = json.load(f_in)
                                intent = kb_data.get("intent")
                                if intent:
                                    rel_path = os.path.relpath(full_path, os.path.dirname(kb_index_path))
                                    self._kb_index[intent] = rel_path.replace("\\", "/")

                                    # Add to _intents dynamically so it acts as a registered intent metadata!
                                    if intent not in self._intents:
                                        self._intents[intent] = {
                                            "category": kb_data.get("category", "JavaScript Concepts"),
                                            "topic_level": kb_data.get("topic_level", "beginner"),
                                            "response_type": "mixed",
                                            "response": "",  # will be dynamically assembled
                                            "route": kb_data.get("route", "CHAT_WORKSPACE"),
                                            "keywords": kb_data.get("aliases", []) + [kb_data.get("topic", "")]
                                        }

                                        # Also add phrases in question_map to keywords
                                        keywords = list(self._intents[intent]["keywords"])
                                        qmap = kb_data.get("question_map", {})
                                        for qtype, questions in qmap.items():
                                            for q in questions:
                                                keywords.append(q)

                                        # Update inverted keyword index for semantic boost
                                        for kw in keywords:
                                            for word in kw.lower().split():
                                                stemmed = _clean_kw(word)
                                                if not stemmed:
                                                    continue
                                                if stemmed not in self._keyword_index:
                                                    self._keyword_index[stemmed] = []
                                                if intent not in self._keyword_index[stemmed]:
                                                    self._keyword_index[stemmed].append(intent)

                                        # Update category index
                                        cat = self._intents[intent]["category"]
                                        if cat not in self._category_index:
                                            self._category_index[cat] = []
                                        if intent not in self._category_index[cat]:
                                            self._category_index[cat].append(intent)
                        except Exception as e:
                            print(f"[WARNING] Failed to auto-index {file}: {e}")

    def _detect_query_focuses(self, query: str, question_map: dict) -> set:
        """
        Analyze user query to detect sub-intents (what, why, how, compare, output/confusion).
        """
        if not query:
            return {"default"}
        
        query_lower = query.lower()
        focuses = set()
        
        # 1. Broad keyword patterns
        keywords_map = {
            "what": ["what is", "define", "definition", "meaning", "intro", "explain"],
            "why": ["why", "reason", "purpose", "benefit", "outdated", "better", "avoid", "problem"],
            "how": ["how", "mechanism", "under the hood", "engine", "internals", "work", "stack", "heap", "execute", "run", "allocate"],
            "compare": ["vs", "versus", "difference", "compare", "contrast", "differ", "distinguish"],
            "output": ["output", "predict", "result", "happen", "prints", "console", "error", "bug", "wrong", "trap", "fail", "quirk", "weird", "edge case"]
        }
        
        # Check for explicit code request
        code_words = ["example", "code", "snippet", "show me", "write", "practice", "syntax", "demo"]
        if any(w in query_lower for w in code_words):
            focuses.add("example")

        for key, words in keywords_map.items():
            if any(w in query_lower for w in words):
                focuses.add(key)
                
        # 2. Similarity overlap with question_map template questions
        query_words = set(query_lower.split())
        best_map_key = None
        max_overlap = 0
        
        for key, questions in question_map.items():
            for q in questions:
                q_words = set(q.lower().split())
                overlap = len(query_words & q_words)
                if overlap > max_overlap:
                    max_overlap = overlap
                    best_map_key = key
                    
        # Add map key if Jaccard-style word overlap is significant
        if max_overlap >= 2 and best_map_key:
            focuses.add(best_map_key)
            
        return focuses

    def _assemble_concept_pack_response(self, kb_data: dict, query: str = None) -> str:
        """
        Dynamically compile a premium textbook response from the Concept Pack data.
        """
        topic = kb_data.get("topic", "JavaScript Concept")
        question_map = kb_data.get("question_map", {})
        focuses = self._detect_query_focuses(query, question_map)
        
        # Compile dimensions header
        dims = kb_data.get("dimensions", {})
        dim_tags = []
        for name, active in dims.items():
            status = "🟢" if active else ""
            dim_tags.append(f"{name.capitalize()}: {status}")
        dim_header = f"️ **Curriculum Focus:** [{' | '.join(dim_tags)}]"
        
        sections = []
        
        # Determine which sections are selected based on focuses
        is_default = len(focuses) == 0 or "what" in focuses or "default" in focuses
        
        # 1. Beginner Explanation (if default or explicitly requested)
        if is_default or "why" in focuses or "compare" in focuses:
            beg = kb_data.get("1_beginner_explanation", {})
            if beg:
                section_str = f"####  Quick Intuition (Analogy)\n> {beg.get('analogy', '')}\n\n**Concept Summary:**\n{beg.get('summary', '')}"
                sections.append(section_str)
                
        # 2. Internal Mechanism (if default or 'how' or 'why' is requested)
        if is_default or "how" in focuses or "why" in focuses:
            mech = kb_data.get("2_internal_mechanism", {})
            if mech:
                section_str = f"#### ️ How it Works (Internal Mechanism)\n• **Execution Flow:** {mech.get('execution_flow', '')}\n• **Memory Allocation:** {mech.get('memory', '')}"
                sections.append(section_str)
                
        # 3. Real World Example (if default or 'example' is requested)
        if is_default or "example" in focuses:
            ex = kb_data.get("3_real_world_example", {})
            if ex:
                code_block = ex.get('code', '')
                section_str = f"####  Real-World Example\n*Use Case: {ex.get('use_case', '')}*\n```javascript\n{code_block}\n```"
                sections.append(section_str)
                
        # 4. Common Confusion (if 'why' or 'compare' or 'output' requested)
        if "why" in focuses or "compare" in focuses or "output" in focuses:
            conf = kb_data.get("4_common_confusion", {})
            if conf:
                section_str = f"#### ️ Common Trap\n> [!WARNING]\n> **Confusion:** {conf.get('trap', '')}\n>\n> **How to Avoid:** {conf.get('fix', '')}"
                sections.append(section_str)
                
        # 5. Edge Case (if 'output' or 'compare' requested, or if present and we are in default mode)
        if is_default or "output" in focuses:
            edge = kb_data.get("6_edge_case", {})
            if edge and edge.get("quirk"):
                code_block = edge.get('code', '')
                section_str = f"####  Edge Case & Quirks\n• **Quirk:** {edge.get('quirk', '')}\n```javascript\n{code_block}\n```"
                sections.append(section_str)

        # Build Graph Relationship links
        rel_links = []
        relationships = kb_data.get("relationships", {})
        
        def make_link(target_intent: str) -> str:
            if target_intent in self._kb_index:
                rel_path = self._kb_index[target_intent]
                abs_path = os.path.join(_BASE_DIR, "knowledge_base", rel_path)
                target_title = target_intent
                if os.path.exists(abs_path):
                    try:
                        with open(abs_path, "r", encoding="utf-8") as f_target:
                            t_data = json.load(f_target)
                            target_title = t_data.get("topic", target_intent)
                    except:
                        pass
                return f'<button class="curriculum-link-btn" data-intent="{target_intent}">{target_title}</button>'
            return f"`{target_intent}`"

        depends = relationships.get("depends_on", [])
        related = relationships.get("related_to", [])
        confused = relationships.get("often_confused_with", [])
        
        if depends:
            links = ", ".join(make_link(t) for t in depends)
            rel_links.append(f"•  **Prerequisite:** {links}")
        if related:
            links = ", ".join(make_link(t) for t in related)
            rel_links.append(f"•  **Related Concept:** {links}")
        if confused:
            links = ", ".join(make_link(t) for t in confused)
            rel_links.append(f"• ️ **Watch Out:** Often confused with {links}")
            
        if rel_links:
            relations_str = "####  Related Tracks\n" + "\n".join(rel_links)
            sections.append(relations_str)

        greeting = "Here is the conceptual breakdown for you, {address}:"
        body = f"### {topic}\n{dim_header}\n\n{greeting}\n\n" + "\n\n---\n\n".join(sections)
        return body

    def load_knowledge_base(self, intent_label: str, default_response: str, default_route: str, query: str = None):
        kb_response = default_response
        route = default_route
        code_example = None
        defaults = {}
        schema = {}
        version = "1.0"
        
        if intent_label in self._kb_index:
            kb_path = os.path.join(_BASE_DIR, "knowledge_base", self._kb_index[intent_label])
            if os.path.exists(kb_path):
                with open(kb_path, "r", encoding="utf-8") as f:
                    kb_data = json.load(f)
                    # Check if this is the new Concept Pack Model format
                    if "1_beginner_explanation" in kb_data:
                        kb_response = self._assemble_concept_pack_response(kb_data, query)
                        route = kb_data.get("route", route)
                        if "3_real_world_example" in kb_data and "code" in kb_data["3_real_world_example"]:
                            code_example = kb_data["3_real_world_example"]["code"]
                        defaults = kb_data.get("defaults", {})
                        schema = kb_data.get("context_schema", {})
                        version = kb_data.get("version", "1.1")
                    else:
                        # Support response_template or fallback to response
                        kb_response = kb_data.get("response_template", kb_data.get("response", kb_response))
                        route = kb_data.get("route", route)
                        code_example = kb_data.get("code_example")
                        defaults = kb_data.get("defaults", {})
                        schema = kb_data.get("context_schema", {})
                        version = kb_data.get("version", "1.0")
                    
        return kb_response, route, code_example, defaults, schema, version

    def resolve(self, intent_label: str, runtime_context: dict = None, query: str = None) -> dict:
        """
        Resolve a predicted intent label to its full metadata, rendering dynamic templates.
        """
        # Dynamic Sub-Intent Resolution: if the ML classifier caught it under the generic catch-all
        if intent_label == "js.fundamentals.query" and query:
            from preprocessing.text_cleaner import clean_text
            cleaned_query = clean_text(query)
            boosted = self.semantic_boost(cleaned_query, top_k=1)
            if boosted and boosted[0][1] > 0:
                intent_label = boosted[0][0]

        if intent_label in self._intents:
            meta = self._intents[intent_label]
            
            # 1. Load Knowledge Base
            template, route, code_example, kb_defaults, schema, version = self.load_knowledge_base(
                intent_label,
                meta.get("response", ""),
                meta.get("route", ""),
                query
            )
            
            # 2. Build Context
            context = self.context_provider.get_context(intent_label, runtime_context, kb_defaults)
            
            # 3. Validate Context
            from semantic.context_engine import ContextValidator
            validation_errors = ContextValidator.validate(schema, context)
            
            # 4. Render Template
            final_response = self.context_engine.fill(template, context)

            result = {
                "intent":      intent_label,
                "response":    final_response,
                "response_template": template,
                "context":     context,
                "route":       route,
                "category":    meta.get("category", ""),
                "keywords":    meta.get("keywords", []),
                "admin_notes": meta.get("admin_notes", ""),
                "resolved":    True,
                "trace": {
                    "classifier": "TF-IDF + Logistic Regression",
                    "kb_file": self._kb_index.get(intent_label, "unknown"),
                    "context_source": list(context.keys()) if context else [],
                    "validation_errors": validation_errors,
                    "rendered": True,
                    "version": version
                }
            }
            if code_example is not None:
                result["code_example"] = code_example
            return result

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

        Uses IDF-style scoring: a keyword token that appears in fewer
        intents gets a higher weight (rarer = more discriminative).

        Args:
            query:  cleaned user input string (already stemmed)
            top_k:  number of top matching intents to return

        Returns:
            List of (intent_label, score) tuples, sorted by score desc.
        """
        query_tokens = set(query.lower().split())

        # Synonym expansion
        query_tokens = self._expand_tokens(query_tokens)

        scores = Counter()
        total_intents = len(self._intents)

        for token in query_tokens:
            # Direct lookup — keyword index keys are already stemmed tokens
            intent_list = self._keyword_index.get(token, [])
            if intent_list:
                # IDF weight: rarer keywords count more
                idf = math.log(total_intents / (1 + len(intent_list)))
                for intent_label in intent_list:
                    scores[intent_label] += idf

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
            "total_intents":     self.intent_count,
            "total_categories":  self.category_count,
            "categories": {
                cat: len(intents)
                for cat, intents in self._category_index.items()
            },
            "total_keywords":    len(self._keyword_index),
            "total_synonyms":    len(self._synonym_map),
            "synonyms_loaded":   bool(self._synonym_map),
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
    print(f"  Total synonyms:   {summary['total_synonyms']}")
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
        status = "OK" if result["resolved"] else "MISS"
        print(f"    [{status}] {label}")
        print(f"      Response: {result['response'][:80]}...")
        print(f"      Route:    {result['route']}")
        print()

    print(f"  Synonym expansion demo:")
    test_queries = [
        ("coach",       "mentor"),
        ("trainer",     "mentor"),
        ("tutor",       "mentor"),
        ("exam",        "quiz/test"),
        ("diploma",     "certificate"),
        ("mic",         "microphone"),
        ("sketching",   "drawing"),
    ]
    for user_word, expected_canonical in test_queries:
        canonical = resolver._synonym_map.get(user_word, "(no mapping)")
        status = "OK" if canonical != "(no mapping)" else "MISS"
        print(f"    [{status}] '{user_word}' -> '{canonical}' (expected: '{expected_canonical}')")

    print(f"\n  Semantic boost with synonym expansion:")
    queries = [
        "I need a coach to guide me",
        "how do I reach my tutor",
        "I want to take an exam",
        "my mic is broken during the call",
    ]
    for q in queries:
        print(f"\n    Query: '{q}'")
        for intent, score in resolver.semantic_boost(q, top_k=3):
            print(f"      -> {intent}: {score:.3f}")

