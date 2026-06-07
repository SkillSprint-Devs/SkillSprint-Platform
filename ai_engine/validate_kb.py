import os
import json
import sys

# Get base directory
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KB_DIR = os.path.join(_BASE_DIR, "knowledge_base")
MAIN_INDEX_PATH = os.path.join(KB_DIR, "index.json")

def load_main_index():
    if not os.path.exists(MAIN_INDEX_PATH):
        print(f"[ERROR] Main index.json missing at: {MAIN_INDEX_PATH}")
        sys.exit(1)
    with open(MAIN_INDEX_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def validate_kb():
    print("=" * 60)
    print("SkillSprint KB & Graph Schema Validator")
    print("=" * 60)

    # 1. Load main index
    main_index = load_main_index()
    registered_intents = set(main_index.keys())
    print(f"[INFO] Loaded main index.json: {len(registered_intents)} registered intents.")

    # 2. Check index files exist
    missing_files_count = 0
    for intent, rel_path in main_index.items():
        abs_path = os.path.join(KB_DIR, rel_path)
        if not os.path.exists(abs_path):
            print(f"[FAIL] Intent '{intent}' points to non-existent file: {rel_path}")
            missing_files_count += 1
    
    if missing_files_count > 0:
        print(f"[ERROR] {missing_files_count} files missing from index.json.")
        sys.exit(1)
    else:
        print("[PASS] All files referenced in main index.json exist.")

    # 3. Find and validate all fundamentals and core_structures JS JSON files
    js_dirs = [
        os.path.join(KB_DIR, "javascript", "fundamentals"),
        os.path.join(KB_DIR, "javascript", "core_structures")
    ]
    
    json_files = []
    for d in js_dirs:
        if os.path.exists(d):
            for root, _, files in os.walk(d):
                for file in files:
                    if file.endswith(".json") and file != "index.json":
                        json_files.append(os.path.join(root, file))

    print(f"[INFO] Found {len(json_files)} fundamentals concept pack files to validate.")
    
    errors = []
    
    # Required keys and their subkeys
    schema_spec = {
        "version": str,
        "intent": str,
        "topic": str,
        "dimensions": dict,
        "relationships": dict,
        "question_map": dict,
        "1_beginner_explanation": dict,
        "2_internal_mechanism": dict,
        "3_real_world_example": dict,
        "4_common_confusion": dict,
        "5_related_topics": list,
        "6_edge_case": dict
    }

    sub_schema_spec = {
        "dimensions": ["syntax", "semantics", "runtime"],
        "relationships": ["depends_on", "related_to", "often_confused_with"],
        "question_map": ["what", "why", "how", "compare", "output"],
        "1_beginner_explanation": ["summary", "analogy"],
        "2_internal_mechanism": ["execution_flow", "memory"],
        "3_real_world_example": ["use_case", "code"],
        "4_common_confusion": ["trap", "fix"],
        "6_edge_case": ["quirk", "code"]
    }

    for file_path in json_files:
        rel_file_path = os.path.relpath(file_path, KB_DIR)
        print(f"\nValidating: {rel_file_path}")
        
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            errors.append(f"{rel_file_path}: Invalid JSON syntax - {e}")
            continue

        # Check top-level types
        for key, expected_type in schema_spec.items():
            if key not in data:
                errors.append(f"{rel_file_path}: Missing root key '{key}'")
                continue
            if not isinstance(data[key], expected_type):
                errors.append(f"{rel_file_path}: Key '{key}' must be of type {expected_type.__name__}, got {type(data[key]).__name__}")

        # Check sub-schemas
        for key, required_subkeys in sub_schema_spec.items():
            if key not in data or not isinstance(data[key], dict):
                continue # Already reported above
            
            sub_dict = data[key]
            for subkey in required_subkeys:
                if subkey not in sub_dict:
                    errors.append(f"{rel_file_path}: In section '{key}', missing required subkey '{subkey}'")
                    continue
                
                # Special validation for question_map list types
                if key == "question_map":
                    if not isinstance(sub_dict[subkey], list):
                        errors.append(f"{rel_file_path}: 'question_map.{subkey}' must be a list of strings")
                    elif len(sub_dict[subkey]) == 0:
                        errors.append(f"{rel_file_path}: 'question_map.{subkey}' list cannot be empty")
                    else:
                        for idx, q in enumerate(sub_dict[subkey]):
                            if not isinstance(q, str) or not q.strip():
                                errors.append(f"{rel_file_path}: 'question_map.{subkey}[{idx}]' must be a non-empty string")

        # Validate Graph Relationship Integrities
        if "relationships" in data and isinstance(data["relationships"], dict):
            rels = data["relationships"]
            for field in ["depends_on", "related_to", "often_confused_with"]:
                if field in rels and isinstance(rels[field], list):
                    for idx, target_intent in enumerate(rels[field]):
                        if not isinstance(target_intent, str):
                            errors.append(f"{rel_file_path}: relationships.{field}[{idx}] must be an intent label (string)")
                            continue
                        if target_intent not in registered_intents:
                            errors.append(f"{rel_file_path}: Graph integrity broken. Intent '{target_intent}' referenced in relationships.{field} is not registered in index.json")

    print("\n" + "=" * 60)
    print("Validation Summary")
    print("=" * 60)
    if errors:
        print(f"[FAIL] Found {len(errors)} validation error(s):")
        for err in errors:
            print(f"  - {err}")
        sys.exit(1)
    else:
        print("[PASS] All Concept Pack schemas and relationships validated successfully!")
        sys.exit(0)

if __name__ == "__main__":
    validate_kb()
