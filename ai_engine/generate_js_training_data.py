"""
SkillSprint AI Engine — JavaScript Training Data Generator
============================================================
Reads js_intents.json and appends all examples to train.csv
and a portion to validation.csv.

Usage:
    cd ai_engine
    python generate_js_training_data.py

Options:
    --dry-run     Preview what would be written without modifying CSVs
    --val-split   Fraction to put in validation (default: 0.2)
"""

import os
import sys
import json
import csv
import random
import argparse
from datetime import datetime

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))

JS_INTENTS_PATH  = os.path.join(_BASE_DIR, "dataset", "js_intents.json")
TRAIN_CSV        = os.path.join(_BASE_DIR, "dataset", "train.csv")
VALIDATION_CSV   = os.path.join(_BASE_DIR, "dataset", "validation.csv")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_js_intents() -> dict:
    with open(JS_INTENTS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_existing_csv(path: str) -> set:
    """Return a set of (text, intent) pairs already in the CSV."""
    existing = set()
    if not os.path.exists(path):
        return existing
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            text   = row.get("text", "").strip()
            intent = row.get("intent", "").strip()
            if text and intent:
                existing.add((text, intent))
    return existing


def append_rows(path: str, rows: list[tuple]) -> int:
    """Append (text, intent) rows to a CSV. Returns number of rows written."""
    if not rows:
        return 0
    file_exists = os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["text", "intent"])  # header
        for text, intent in rows:
            writer.writerow([text, intent])
    return len(rows)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def generate(dry_run: bool = False, val_split: float = 0.2, seed: int = 42):
    random.seed(seed)

    print("=" * 65)
    print("  SkillSprint — JS Training Data Generator")
    print("=" * 65)

    # Load intents
    js_intents = load_js_intents()
    print(f"\n  Loaded {len(js_intents)} JS intents from js_intents.json")

    # Load existing rows to avoid duplicates
    existing_train = load_existing_csv(TRAIN_CSV)
    existing_val   = load_existing_csv(VALIDATION_CSV)
    print(f"  Existing train.csv rows:      {len(existing_train)}")
    print(f"  Existing validation.csv rows: {len(existing_val)}")

    # Build all (text, intent) pairs from examples
    all_pairs: list[tuple] = []
    intent_stats = {}

    for intent_key, meta in js_intents.items():
        examples = meta.get("examples", [])
        intent_stats[intent_key] = len(examples)
        for example in examples:
            text = example.strip().lower()
            if text:
                all_pairs.append((text, intent_key))

    print(f"\n  Total example pairs generated: {len(all_pairs)}")

    # Split into train and validation
    random.shuffle(all_pairs)
    split_idx     = int(len(all_pairs) * (1 - val_split))
    train_pairs   = all_pairs[:split_idx]
    val_pairs     = all_pairs[split_idx:]

    # Filter out duplicates
    new_train = [(t, i) for t, i in train_pairs if (t, i) not in existing_train]
    new_val   = [(t, i) for t, i in val_pairs   if (t, i) not in existing_val]

    print(f"\n  New rows for train.csv:      {len(new_train)}")
    print(f"  New rows for validation.csv: {len(new_val)}")
    print(f"  Duplicates skipped:          {len(all_pairs) - len(new_train) - len(new_val)}")

    # Per-intent breakdown
    print(f"\n  Per-intent example counts:")
    print(f"  {'Intent':<40s} {'Examples':>8}")
    print(f"  {'-'*40} {'-'*8}")
    for intent_key, count in sorted(intent_stats.items()):
        print(f"  {intent_key:<40s} {count:>8}")

    if dry_run:
        print(f"\n  [DRY RUN] No files were modified.")
        print(f"  Re-run without --dry-run to apply.")
        return

    # Append to CSVs
    written_train = append_rows(TRAIN_CSV, new_train)
    written_val   = append_rows(VALIDATION_CSV, new_val)

    print(f"\n  Written to train.csv:      {written_train} rows")
    print(f"  Written to validation.csv: {written_val} rows")

    # Summary
    total_train = len(existing_train) + written_train
    total_val   = len(existing_val) + written_val
    total_intents = len(set(i for _, i in list(existing_train) + new_train))

    print(f"\n{'=' * 65}")
    print(f"  Done — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  train.csv total rows:      {total_train}")
    print(f"  validation.csv total rows: {total_val}")
    print(f"  Total unique intents:      {total_intents}")
    print(f"{'=' * 65}")
    print(f"\n  Next step: retrain the model")
    print(f"    cd ai_engine")
    print(f"    python -m training.train_model")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate JS training data from js_intents.json"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Preview changes without writing to CSV files"
    )
    parser.add_argument(
        "--val-split", type=float, default=0.2,
        help="Fraction of examples to put in validation (default: 0.2)"
    )
    parser.add_argument(
        "--seed", type=int, default=42,
        help="Random seed for reproducibility (default: 42)"
    )
    args = parser.parse_args()

    generate(dry_run=args.dry_run, val_split=args.val_split, seed=args.seed)
