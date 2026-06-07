import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
index_path = os.path.join(BASE_DIR, "knowledge_base", "index.json")

with open(index_path, "r", encoding="utf-8") as f:
    idx = json.load(f)

# Update index dynamically
js_dir = os.path.join(BASE_DIR, "knowledge_base", "javascript")
for root, _, files in os.walk(js_dir):
    for file in files:
        if file.endswith(".json") and file != "index.json":
            full_path = os.path.join(root, file)
            with open(full_path, "r", encoding="utf-8") as f_in:
                try:
                    kb_data = json.load(f_in)
                    intent = kb_data.get("intent")
                    if intent:
                        rel = os.path.relpath(full_path, os.path.dirname(index_path))
                        idx[intent] = rel.replace("\\", "/")
                except:
                    pass

with open(index_path, "w", encoding="utf-8") as f:
    json.dump(idx, f, indent=2)

print("Updated index.json successfully")
