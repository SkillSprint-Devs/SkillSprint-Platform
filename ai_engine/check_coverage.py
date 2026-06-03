import csv
from collections import Counter

rows = list(csv.DictReader(open("dataset/train.csv", encoding="utf-8")))
val_rows = list(csv.DictReader(open("dataset/validation.csv", encoding="utf-8")))

train_counts = Counter(r["intent"] for r in rows)
val_counts = Counter(r["intent"] for r in val_rows)

all_intents = sorted(set(train_counts.keys()) | set(val_counts.keys()))

print("Intent Coverage Report")
print("=" * 60)
print(f"{'Intent':<45} {'Train':>6} {'Val':>5} {'Total':>6}")
print("-" * 60)

for intent in all_intents:
    t = train_counts.get(intent, 0)
    v = val_counts.get(intent, 0)
    total = t + v
    flag = " *** LOW ***" if total < 25 else ""
    print(f"{intent:<45} {t:>6} {v:>5} {total:>6}{flag}")

print("=" * 60)
print(f"\nTotal train: {sum(train_counts.values())}, Total val: {sum(val_counts.values())}")
low = [(i, train_counts.get(i,0) + val_counts.get(i,0)) for i in all_intents if train_counts.get(i,0) + val_counts.get(i,0) < 25]
print(f"\nIntents below 25 samples: {len(low)}")
for i, n in low:
    print(f"  - {i}: {n}")
