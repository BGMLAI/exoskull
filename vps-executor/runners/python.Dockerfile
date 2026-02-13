# ExoSkull Python Runner — sandboxed code execution environment
FROM python:3.12-slim

# Install common development tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Pre-install common Python tools
RUN pip install --no-cache-dir pytest ruff mypy black

# Create workspace directory
RUN mkdir -p /workspace /output && chmod 777 /workspace /output

# Non-root user for security
RUN useradd -m -s /bin/bash runner
USER runner

WORKDIR /workspace

CMD ["sh", "-c", "echo 'Ready'"]
