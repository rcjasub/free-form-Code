# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
# applied on startup (db/migrate.ts)
COPY db/schema.sql ./dist/db/schema.sql

EXPOSE 4000
CMD ["npm", "start"]
