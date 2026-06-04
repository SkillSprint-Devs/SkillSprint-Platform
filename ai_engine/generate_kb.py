import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(BASE_DIR, "dataset")
KB_DIR = os.path.join(BASE_DIR, "knowledge_base")

def get_kb_category(intent_label, meta):
    if intent_label.startswith("js."):
        return "javascript"
    if "troubleshoot" in intent_label or "error" in intent_label:
        return "troubleshooting"
    return "platform"

def main():
    os.makedirs(KB_DIR, exist_ok=True)
    os.makedirs(os.path.join(KB_DIR, "javascript"), exist_ok=True)
    os.makedirs(os.path.join(KB_DIR, "platform"), exist_ok=True)
    os.makedirs(os.path.join(KB_DIR, "troubleshooting"), exist_ok=True)

    index_map = {}

    def process_file(filepath):
        if not os.path.exists(filepath):
            return
        with open(filepath, "r", encoding="utf-8") as f:
            intents = json.load(f)
        for label, meta in intents.items():
            cat = get_kb_category(label, meta)
            
            # format the filename
            filename = f"{label.replace('.', '_')}.json"
            rel_path = f"{cat}/{filename}"
            full_path = os.path.join(KB_DIR, cat, filename)
            
            # prepare the kb file data
            kb_data = {
                "intent": label,
                "title": meta.get("category", label),
                "response": meta.get("response", ""),
            }
            # copy other useful metadata over? The user said "Each folder = intent -> response mapping. Not training data. Not ML. Just final answers your bot returns."
            # We can preserve route and code_example
            if "route" in meta:
                kb_data["route"] = meta["route"]
            if "code_example" in meta:
                kb_data["code_example"] = meta["code_example"]
                
            with open(full_path, "w", encoding="utf-8") as f_out:
                json.dump(kb_data, f_out, indent=2)
                
            index_map[label] = rel_path

    process_file(os.path.join(DATASET_DIR, "intents.json"))
    process_file(os.path.join(DATASET_DIR, "js_intents.json"))

    with open(os.path.join(KB_DIR, "index.json"), "w", encoding="utf-8") as f_idx:
        json.dump(index_map, f_idx, indent=2)

    print(f"Generated {len(index_map)} knowledge base files in {KB_DIR}")

if __name__ == "__main__":
    main()
