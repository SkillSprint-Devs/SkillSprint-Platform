import json
import csv
import os

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INTENTS_PATH = os.path.join(_BASE_DIR, "dataset", "intents.json")
TRAIN_PATH = os.path.join(_BASE_DIR, "dataset", "train.csv")

def main():
    # 1. Load training examples grouped by intent
    examples_by_intent = {}
    with open(TRAIN_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            intent = row["intent"]
            text = row["text"]
            if intent not in examples_by_intent:
                examples_by_intent[intent] = []
            if len(examples_by_intent[intent]) < 4:
                examples_by_intent[intent].append(text)

    # 2. Load intents.json
    with open(INTENTS_PATH, "r", encoding="utf-8") as f:
        intents = json.load(f)

    # 3. Update each intent
    for intent_id, meta in intents.items():
        # Add examples
        if intent_id in examples_by_intent:
            meta["examples"] = examples_by_intent[intent_id]
        else:
            meta["examples"] = []

        # Decouple route
        route = meta.get("route", "")
        if route == "/dashboard/live-sessions":
            meta["route"] = "LIVE_SESSIONS"
        elif route == "/dashboard/pair-programming":
            meta["route"] = "PAIR_PROGRAMMING"
        elif route == "/dashboard/whiteboard":
            meta["route"] = "WHITEBOARD"
        elif route == "/dashboard/matchmaking":
            meta["route"] = "MATCHMAKING"
        elif route == "/dashboard/quizzes":
            meta["route"] = "QUIZZES"
        elif route == "/dashboard/certificates":
            meta["route"] = "CERTIFICATES"
        elif route == "/dashboard/library":
            meta["route"] = "LIBRARY"
        elif route == "/dashboard/wallet":
            meta["route"] = "WALLET"
        elif route == "/dashboard/tasks":
            meta["route"] = "TASKS"
        elif route == "/dashboard/social":
            meta["route"] = "SOCIAL"
        elif route == "/help/authentication":
            meta["route"] = "HELP_AUTH"
        elif route == "/dashboard/settings":
            meta["route"] = "SETTINGS"
        elif route == "/help/system-health":
            meta["route"] = "SYSTEM_HEALTH"
        elif not route:
            meta["route"] = "NONE"
        else:
            meta["route"] = route.upper().replace("/", "_").strip("_").replace("-", "_")

    # 4. Save intents.json
    with open(INTENTS_PATH, "w", encoding="utf-8") as f:
        json.dump(intents, f, indent=2)

    print("Updated intents.json with examples and decoupled routes.")

if __name__ == "__main__":
    main()
