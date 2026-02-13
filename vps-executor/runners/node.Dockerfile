# ExoSkull Node.js Runner — sandboxed code execution environment
FROM node:22-slim

# Install common development tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Pre-install common global tools
RUN npm install -g typescript tsx eslint prettier

# Create workspace directory
RUN mkdir -p /workspace /output && chmod 777 /workspace /output

# Non-root user for security
RUN useradd -m -s /bin/bash runner
USER runner

WORKDIR /workspace

# Default: just run whatever command is passed
CMD ["sh", "-c", "echo 'Ready'"]
