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

def check(desc, query, ctx, expected_intent, expected_in_response, expected_trace_keys=None):
    global passed, failed
    print(f"\n--- {desc} ---")
    result = predict_intent(query, ctx)
    intent   = result.get("intent")
    response = result.get("response", "")
    context  = result.get("context", {})
    trace    = result.get("trace", {})

    print(f"  Intent:   {intent}")
    print(f"  Method:   {result.get('method')}")
    print(f"  Context:  {context}")
    print(f"  Trace:    {trace}")
    print(f"  Response: {response[:120]}...")

    intent_ok = intent == expected_intent
    resp_ok   = expected_in_response in response if expected_in_response else True
    trace_ok  = all(k in trace for k in expected_trace_keys) if expected_trace_keys else True

    if intent_ok and resp_ok and trace_ok:
        print(f"  [PASS] all checks passed")
        passed += 1
    else:
        if not intent_ok:
            print(f"  [FAIL] intent: expected '{expected_intent}', got '{intent}'")
        if not resp_ok:
            print(f"  [FAIL] '{expected_in_response}' not in response")
        if not trace_ok:
            print(f"  [FAIL] trace missing some of expected keys: {expected_trace_keys}")
        failed += 1

# Test 1: js.closures with runtime username Fatima
check(
    "Test 1: js.closures with runtime username 'Fatima'",
    "what is a closure?",
    {"username": "Fatima"},
    expected_intent="js.closures",
    expected_in_response="Fatima",
    expected_trace_keys=["classifier", "kb_file", "context_source", "validation_errors", "rendered", "version"]
)

# Test 2: js.closures with KB default fallback
check(
    "Test 2: js.closures with KB default fallback",
    "js closures",
    None,
    expected_intent="js.closures",
    expected_in_response="Developer"
)

# Test 3: platform.session.join
check(
    "Test 3: platform.session.join with user context",
    "how to join live session",
    {"username": "Zainab"},
    expected_intent="platform.session.join",
    expected_in_response="Zainab"
)

# Test 4: platform.wallet.balance
check(
    "Test 4: platform.wallet.balance with custom status in context",
    "check my wallet balance",
    {"username": "Hamza", "status": "suspended"},
    expected_intent="platform.wallet.balance",
    expected_in_response="suspended"
)

# Test 5: validation error trace (missing required key in schema)
print("\n--- Test 5: validation error trace check ---")
# platform.session.join context_schema has: session_id, which is not in defaults and not in context
result = predict_intent("how to join live session", {"username": "Zainab"})
trace = result.get("trace", {})
val_errors = trace.get("validation_errors", [])
print(f"  Validation Errors: {val_errors}")
if "session_id" in val_errors:
    print("  [PASS] detected missing session_id correctly")
    passed += 1
else:
    print("  [FAIL] did not detect missing session_id in validation_errors")
    failed += 1

print(f"\n{'=' * 60}")
print(f"Results: {passed}/{passed + failed} tests passed")
print("=" * 60)
