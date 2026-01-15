# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Update npm to latest
RUN npm install -g npm@latest

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (ci for reproducible builds)
RUN npm ci

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Update npm to latest
RUN npm install -g npm@latest

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Update npm to latest and create non-root user
RUN npm install -g npm@latest && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 dashboard

# Copy built application (TanStack Start outputs to .output/)
COPY --from=builder --chown=dashboard:nodejs /app/.output ./.output
COPY --from=builder --chown=dashboard:nodejs /app/package.json ./package.json
COPY --from=builder --chown=dashboard:nodejs /app/package-lock.json ./package-lock.json

# Install production dependencies only
RUN npm ci --omit=dev

USER dashboard

EXPOSE 3000

ENV PORT=3000
ENV HOST="0.0.0.0"

# TanStack Start node-server output
CMD ["node", ".output/server/index.mjs"]
