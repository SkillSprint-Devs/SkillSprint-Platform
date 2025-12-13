FROM node:18-alpine

WORKDIR /app

# Copy backend dependencies first for caching
COPY backend/package*.json ./backend/

WORKDIR /app/backend
RUN npm install

# Copy source
WORKDIR /app
COPY . .

# Expose port
EXPOSE 5000

# Start server
WORKDIR /app/backend
CMD ["node", "server.js"]
