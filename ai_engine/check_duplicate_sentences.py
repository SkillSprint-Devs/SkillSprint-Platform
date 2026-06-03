"""
Validation script to check for duplicate sentences (data leakage)
between the training and validation sets.
"""

import os
import csv

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TRAIN_CSV = os.path.join(_BASE_DIR, "dataset", "train.csv")
VALIDATION_CSV = os.path.join(_BASE_DIR, "dataset", "validation.csv")

def load_texts(filepath: str) -> set:
    texts = set()
    if not os.path.exists(filepath):
        return texts
        
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            text = row.get("text", "").strip().lower()
            if text:
                texts.add(text)
    return texts

def main():
    print("=" * 60)
    print("  Checking for Train / Validation Data Leakage")
    print("=" * 60)
    
    train_texts = load_texts(TRAIN_CSV)
    val_texts = load_texts(VALIDATION_CSV)
    
    if not train_texts or not val_texts:
        print("[!] Could not load dataset files.")
        return
        
    intersection = train_texts.intersection(val_texts)
    
    print(f"  Train samples:      {len(train_texts)}")
    print(f"  Validation samples: {len(val_texts)}")
    print(f"  Duplicates found:   {len(intersection)}")
    
    if len(intersection) > 0:
        print("\n  [WARNING] Data leakage detected! The following sentences appear in both sets:")
        for idx, sentence in enumerate(list(intersection)[:10]):
            print(f"    - \"{sentence}\"")
        if len(intersection) > 10:
            print(f"    ... and {len(intersection) - 10} more.")
    else:
        print("\n  [OK] No data leakage detected. Train \u2229 Validation == Empty.")
        
if __name__ == "__main__":
    main()
