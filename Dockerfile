FROM node:20-slim

# Cài curl + netcat cho healthcheck và entrypoint
RUN apt-get update && apt-get install -y curl netcat-openbsd && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json + lockfile để cache dependency layer
COPY package*.json ./

# Cài dependencies (production only)
RUN npm ci --only=production

# Copy source code
COPY src/ /app/src/
COPY scripts/ /app/scripts/
COPY package.json /app/

# Tạo thư mục data
RUN mkdir -p /app/data/cookies

# Entrypoint + healthcheck
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "start"]
