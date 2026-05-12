# SkillSprint Python Runner
# Minimal, non-root, read-only compatible image
FROM python:3.12-alpine

# Create a non-root user to run code
RUN addgroup -S runner && adduser -S runner -G runner

# Set working dir
WORKDIR /code

# Drop to non-root
USER runner
