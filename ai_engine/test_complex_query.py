import sys
import os
import io

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from app import load_models, predict_intent

load_models()

print("=" * 60)
print("TEST: Complex Query Parsing (e.g. why hoisting + example)")
print("=" * 60)

query = "why hoisting + example"
result = predict_intent(query, {})

print(f"Query: {query}")
print(f"Intent: {result.get('intent')}")
print(f"Response: \n{result.get('response')}")
