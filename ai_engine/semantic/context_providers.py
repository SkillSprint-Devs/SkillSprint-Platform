class ContextProvider:
    def get_user_context(self):
        """
        Base user context from the application layer.
        
        In production this would be populated from a JWT/session token
        decoded by the Node.js backend and forwarded in the request body.
        
        Returns an empty dict here — username and user-specific data
        MUST come from runtime_context (passed via the API request).
        KB defaults in each intent file act as the last-resort fallback.
        """
        return {}

    def get_intent_context(self, intent):
        """
        Intent-specific live context (static defaults that describe the intent).
        These can later be replaced by real DB/API calls per intent.
        """
        if intent == "platform.wallet.balance":
            return {"status": "active", "page": "Wallet Dashboard"}
        elif intent == "platform.session.join":
            return {"session_type": "live coding session", "page": "Dashboard", "action": "Join Now"}
        return {}

    def get_context(self, intent, runtime_context=None, kb_defaults=None):
        """
        Build final context by merging all sources.

        Priority (highest → lowest):
          1. runtime_context  — sent by frontend (JWT username, user credits, etc.)
          2. intent_context   — intent-specific live/static data
          3. kb_defaults      — fallback values defined in the KB JSON file
        """
        base = self.get_user_context()          # always empty, ready for DB wiring
        intent_context = self.get_intent_context(intent)
        kb_defaults = kb_defaults or {}

        # Priority: Runtime > Intent > KB Defaults
        merged = {**kb_defaults, **base, **intent_context, **(runtime_context or {})}
        return merged
