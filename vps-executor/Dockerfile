# ExoSkull VPS Executor Server
FROM node:22-slim

# Install Docker CLI, ripgrep (168x faster than grep), tree
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    ripgrep \
    tree \
    && curl -fsSL https://get.docker.com | sh \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY dist/ ./dist/

EXPOSE 3500

CMD ["node", "dist/server.js"]
