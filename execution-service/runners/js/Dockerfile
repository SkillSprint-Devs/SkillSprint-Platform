# SkillSprint JavaScript Runner
# Minimal, non-root, read-only compatible image
FROM node:20-alpine

# Create a non-root user to run code
RUN addgroup -S runner && adduser -S runner -G runner

# Set working dir
WORKDIR /code

# Drop to non-root
USER runner
