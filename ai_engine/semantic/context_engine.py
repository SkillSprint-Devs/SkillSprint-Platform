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
