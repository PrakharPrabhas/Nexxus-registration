# =========================================================
# NEXXATHON - PRODUCTION DOCKERFILE
# Multi-stage lightweight production container
# =========================================================

FROM node:20-alpine AS base

# Install security updates
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Non-root user for security
USER node

# Expose port
EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

# Start production server
CMD ["node", "server/index.js"]
