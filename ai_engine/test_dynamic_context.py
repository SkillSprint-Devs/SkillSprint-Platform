import sys
import os
import io

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from app import load_models, predict_intent

load_models()

print("=" * 60)
print("MICRO-POC: Dynamic Context Injection — Full Test Suite")
print("=" * 60)

passed = 0
failed = 0

def check(desc, query, ctx, expected_intent, expected_username_in_response):
    global passed, failed
    print(f"\n--- {desc} ---")
    result = predict_intent(query, ctx)
    intent   = result.get("intent")
    response = result.get("response", "")
    context  = result.get("context", {})
    username = context.get("username", "")

    print(f"  Intent:   {intent}")
    print(f"  Method:   {result.get('method')}")
    print(f"  Context:  {context}")
    print(f"  Response: {response[:120]}...")

    intent_ok = intent == expected_intent
    resp_ok   = expected_username_in_response in response if expected_username_in_response else True

    if intent_ok and resp_ok:
        print(f"  [PASS] username='{username}' resolved correctly")
        passed += 1
    else:
        if not intent_ok:
            print(f"  [FAIL] intent: expected '{expected_intent}', got '{intent}'")
        if not resp_ok:
            print(f"  [FAIL] '{expected_username_in_response}' not in response")
        failed += 1

# Test 1: username supplied via runtime context (e.g. from JWT)
check(
    "Test 1: runtime username 'Fatima' (from frontend context)",
    "what is a closure?",
    {"username": "Fatima"},
    expected_intent="js.closures",
    expected_username_in_response="Fatima"
)

# Test 2: different runtime username — proves it's NOT hardcoded
check(
    "Test 2: runtime username 'Ahmed' — different user, proves dynamic",
    "explain closures in js",
    {"username": "Ahmed"},
    expected_intent="js.closures",
    expected_username_in_response="Ahmed"
)

# Test 3: no context at all → KB defaults kick in ("Developer")
check(
    "Test 3: no context → KB default 'Developer' from js_closures.json",
    "js closures",
    None,
    expected_intent="js.closures",
    expected_username_in_response="Developer"
)

# Test 4: normalized context format (user.name from JWT payload)
check(
    "Test 4: user.name format normalization → 'Sara'",
    "tell me about closures",
    {"user": {"name": "Sara"}},
    expected_intent="js.closures",
    expected_username_in_response="Sara"
)

print(f"\n{'=' * 60}")
print(f"Results: {passed}/{passed + failed} tests passed")
print("=" * 60)
