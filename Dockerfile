FROM node:18-alpine

WORKDIR /app

# Copy backend package files first (for caching)
COPY backend/package*.json ./backend/

WORKDIR /app/backend
RUN npm install

# Copy rest of the project
WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend

# Expose port
EXPOSE 5000

# Start server
WORKDIR /app/backend
CMD ["node", "server.js"]

