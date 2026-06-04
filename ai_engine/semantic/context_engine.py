import re

class ContextEngine:
    def fill(self, template: str, context: dict) -> str:
        if not template:
            return ""
            
        pattern = re.compile(r"\{([a-zA-Z0-9_]+)\}")

        def replace(match):
            key = match.group(1)
            # Safe replacement: if key missing, keep the template placeholder
            return str(context.get(key, f"{{{key}}}"))

        return pattern.sub(replace, template)


class ContextValidator:
    @staticmethod
    def validate(schema: dict, context: dict) -> list:
        """
        Validate context against a schema of expected keys.
        Returns a list of missing keys.
        """
        missing = []
        if not schema:
            return missing
        for key in schema:
            if key not in context or context[key] is None or context[key] == "":
                missing.append(key)
        return missing

