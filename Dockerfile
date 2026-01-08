# Builder stage compiles TypeScript and installs dependencies
FROM node:20-bullseye-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && rm -rf /var/lib/apt/lists/*
RUN npm install
COPY . .
RUN npm run build

# Runtime stage
FROM node:20-bullseye-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto-cjk \
    libcairo2 \
    libpango-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    libgdk-pixbuf2.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxtst6 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libnss3 \
    libasound2 \
    libgbm1 \
    libpangocairo-1.0-0 \
    libgtk-3-0 \
    libxss1 \
    libappindicator3-1 \
    fonts-liberation \
    gconf-service \
    libudev1 \
    lsb-release \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/mermaid.config.json ./mermaid.config.json
COPY --from=builder /app/puppeteer.config.json ./puppeteer.config.json

RUN npm install --omit=dev

ENV NODE_ENV=production
ENV TZ=UTC
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_CONFIG_PATH=/app/puppeteer.config.json
ENV MERMAID_CONFIG_PATH=/app/mermaid.config.json

RUN mkdir -p /tmp/mermaid

EXPOSE 3000
CMD ["npm", "run", "start"]
