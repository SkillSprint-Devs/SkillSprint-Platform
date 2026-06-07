import os
import json
import csv

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JS_INTENTS_PATH = os.path.join(_BASE_DIR, "dataset", "js_intents.json")
TRAIN_CSV = os.path.join(_BASE_DIR, "dataset", "train.csv")
VALIDATION_CSV = os.path.join(_BASE_DIR, "dataset", "validation.csv")

new_questions = [
    # Variables
    "what is a variable in javascript",
    "difference between let, const and var",
    "why do we use variables",
    "how to declare a variable in js",
    "why let is better than var",
    "why const gives error when reassigned",
    "can i change const array",
    "why var is outdated",
    "why var is accessible outside block",
    "what is variable hoisting",
    "why let is not hoisted like var",
    "temporal dead zone kya hota hai",
    # Data types
    "what are data types in javascript",
    "primitive vs non-primitive types",
    "why array is object in js",
    "is null a number or object",
    "why typeof null is object",
    "difference between undefined and null",
    "how js decides type automatically",
    "dynamic typing kya hota hai",
    # Comments
    "what are comments in js",
    "why comments are used",
    "single line vs multi-line comments",
    "do comments affect performance",
    # Console
    "what is console in javascript",
    "difference between console.log and return",
    "why console.log shows undefined sometimes",
    "debugging using console",
    # Operators
    "what are operators in js",
    "arithmetic operators",
    "difference between == and ===",
    "why 0 == false is true",
    "why \"\" == 0 is true",
    "what is type coercion in operators",
    # Type coercion
    "what is type coercion",
    "why js converts types automatically",
    "implicit vs explicit coercion",
    "why \"5\" - 1 = 4 but \"5\" + 1 = 51",
    # Strict mode
    "what is strict mode",
    "why use \"use strict\"",
    "what errors strict mode catches",
    "difference between strict and non-strict js",
    # Expressions & Statements
    "difference between expression and statement",
    "is function a statement or expression",
    "what is return statement",
    "why expressions return values",
    # Hoisting
    "what is hoisting in js",
    "why can i use variable before declaration",
    "why functions are hoisted but let is not",
    "what is TDZ",
    "does hoisting move code physically",
    # Scope (basic)
    "what is scope in javascript",
    "global vs local scope",
    "block scope kya hota hai",
    "why var ignores block scope",
    # Execution context (intro)
    "what happens when js runs code",
    "what is execution context",
    "what is call stack",
    "what is memory heap (basic idea)"
]

def consolidate():
    print("=" * 60)
    print("SkillSprint Dataset Consolidator")
    print("=" * 60)

    # 1. Read existing js_intents.json
    if not os.path.exists(JS_INTENTS_PATH):
        print(f"[ERROR] js_intents.json not found at {JS_INTENTS_PATH}")
        return
        
    with open(JS_INTENTS_PATH, "r", encoding="utf-8") as f:
        js_intents = json.load(f)

    # Combine all keywords and examples
    all_keywords = set()
    all_examples = set(new_questions) # seed with the new query-space questions

    for intent, meta in js_intents.items():
        if intent.startswith("js."):
            # Gather keywords
            for kw in meta.get("keywords", []):
                all_keywords.add(kw)
            # Gather examples
            for ex in meta.get("examples", []):
                all_examples.add(ex)

    # Add general JS signals as keywords
    additional_kws = [
        "javascript", "js", "comments", "console", "expression", "statement", 
        "operator", "strict", "conditional", "loop", "stack", "heap", "memory", "execution"
    ]
    for ak in additional_kws:
        all_keywords.add(ak)

    # Construct the single consolidated JS intent
    consolidated_js = {
        "js.fundamentals.query": {
            "category": "JavaScript Concepts",
            "topic_level": "beginner",
            "response_type": "mixed",
            "response": "Here is the conceptual breakdown for you.",
            "code_example": "",
            "route": "QUIZZES",
            "keywords": sorted(list(all_keywords)),
            "admin_notes": "Consolidated JavaScript fundamentals and query engine intent handler.",
            "examples": sorted(list(all_examples))
        }
    }

    # Save to js_intents.json
    with open(JS_INTENTS_PATH, "w", encoding="utf-8") as f:
        json.dump(consolidated_js, f, indent=2)
    print(f"[PASS] Consolidated js_intents.json saved successfully. Total examples: {len(all_examples)}")

    # 2. Rewrite train.csv
    if os.path.exists(TRAIN_CSV):
        rows = []
        with open(TRAIN_CSV, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader)
            for row in reader:
                if len(row) >= 2:
                    text, intent = row[0], row[1]
                    if intent.startswith("js."):
                        intent = "js.fundamentals.query"
                    rows.append((text, intent))
        
        with open(TRAIN_CSV, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(header)
            for text, intent in rows:
                writer.writerow([text, intent])
        print(f"[PASS] Rewrote train.csv to consolidate JS classes. Total rows: {len(rows)}")

    # 3. Rewrite validation.csv
    if os.path.exists(VALIDATION_CSV):
        rows = []
        with open(VALIDATION_CSV, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader)
            for row in reader:
                if len(row) >= 2:
                    text, intent = row[0], row[1]
                    if intent.startswith("js."):
                        intent = "js.fundamentals.query"
                    rows.append((text, intent))
        
        with open(VALIDATION_CSV, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(header)
            for text, intent in rows:
                writer.writerow([text, intent])
        print(f"[PASS] Rewrote validation.csv to consolidate JS classes. Total rows: {len(rows)}")

if __name__ == "__main__":
    consolidate()
