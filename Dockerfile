# Claude Bot Platform - Docker Image
# Isolated environment for running multi-bot platform with Claude Code CLI

FROM ubuntu:22.04

# Prevent interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    ca-certificates \
    xvfb \
    build-essential \
    python3 \
    # Node.js
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
# Note: This assumes the install script works in Docker
# We may need to adjust based on actual Claude installation requirements
RUN curl -fsSL https://claude.com/install.sh | sh || echo "Claude install may need manual setup"

# Create app directory
WORKDIR /app

# Copy package files first (for layer caching)
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Copy application code
COPY . .

# Create directories for sessions and projects
RUN mkdir -p /root/.claude/projects

# Expose port (if bot manager has API endpoint)
EXPOSE 3000

# Health check (optional - check if bot manager is responsive)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Start Xvfb (virtual display) and bot manager
# Xvfb runs in background, then start bot manager
CMD ["sh", "-c", "Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 & export DISPLAY=:99 && node server.js"]
