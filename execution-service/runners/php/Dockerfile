# SkillSprint PHP Runner
# Minimal, non-root, read-only compatible image
FROM php:8.3-cli-alpine

# Create a non-root user to run code
RUN addgroup -S runner && adduser -S runner -G runner

# Set working dir
WORKDIR /code

# Drop to non-root
USER runner
