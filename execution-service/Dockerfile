# execution-service/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# The execution ORCHESTRATOR — not a runner itself.
# This container:
#   - Runs the Express API (server.js)
#   - Has access to the Docker socket to spawn runner containers
#   - Is NEVER exposed to the internet (no ports: in docker-compose)
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

# Install Docker CLI so this service can call `docker run` on the host daemon
RUN apk add --no-cache docker-cli

WORKDIR /app

# Copy dependency files first (layer cache)
COPY package.json ./
RUN npm install --omit=dev

# Copy source
COPY server.js ./
COPY langConfig.js ./

EXPOSE 4000

CMD ["node", "server.js"]
