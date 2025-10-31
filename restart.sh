#!/bin/bash

# Claude Bot Platform - Restart Script
# Cleanly stops all bot processes and restarts the server

echo "🛑 Stopping all bot servers..."

# Step 1: Get all PIDs first (before killing anything)
NODE_PIDS=$(ps aux | grep "node server.js" | grep -v grep | awk '{print $2}')
NPM_PIDS=$(ps aux | grep "npm.*start" | grep -v grep | awk '{print $2}')

# Step 2: Kill them all (graceful first)
for pid in $NODE_PIDS; do
  echo "Killing node server.js (PID: $pid)"
  kill $pid 2>/dev/null
done

for pid in $NPM_PIDS; do
  echo "Killing npm start (PID: $pid)"
  kill $pid 2>/dev/null
done

# Wait for graceful shutdown
sleep 2

# Step 3: Force kill anything that survived
REMAINING_NODE=$(ps aux | grep "node server.js" | grep -v grep | awk '{print $2}')
REMAINING_NPM=$(ps aux | grep "npm.*start" | grep -v grep | awk '{print $2}')

if [ -n "$REMAINING_NODE" ] || [ -n "$REMAINING_NPM" ]; then
  echo "⚠️  Some processes still running, force killing..."

  for pid in $REMAINING_NODE; do
    echo "Force killing node (PID: $pid)"
    kill -9 $pid 2>/dev/null
  done

  for pid in $REMAINING_NPM; do
    echo "Force killing npm (PID: $pid)"
    kill -9 $pid 2>/dev/null
  done

  sleep 1
fi

# Step 4: Clean up MCP server processes
echo "🧹 Cleaning up MCP servers..."
MCP_KILLED=0

# Kill image-gen MCP servers
if pkill -f "image-gen-mcp/index.js" 2>/dev/null; then
  MCP_COUNT=$(pgrep -f "image-gen-mcp/index.js" 2>/dev/null | wc -l)
  echo "   Killed image-gen-mcp servers"
  MCP_KILLED=$((MCP_KILLED + MCP_COUNT))
fi

# Kill TTS MCP servers
if pkill -f "TTS-mcp/index.js" 2>/dev/null; then
  MCP_COUNT=$(pgrep -f "TTS-mcp/index.js" 2>/dev/null | wc -l)
  echo "   Killed TTS-mcp servers"
  MCP_KILLED=$((MCP_KILLED + MCP_COUNT))
fi

# Kill chat-context MCP servers
if pkill -f "chat-context-mcp.*index.js" 2>/dev/null; then
  MCP_COUNT=$(pgrep -f "chat-context-mcp.*index.js" 2>/dev/null | wc -l)
  echo "   Killed chat-context-mcp servers"
  MCP_KILLED=$((MCP_KILLED + MCP_COUNT))
fi

# Kill any other MCP servers (playwright, notebooklm, etc)
if pkill -f "playwright-mcp-server" 2>/dev/null; then
  echo "   Killed playwright-mcp servers"
fi

if pkill -f "notebooklm-mcp.*index.js" 2>/dev/null; then
  echo "   Killed notebooklm-mcp servers"
fi

if [ $MCP_KILLED -gt 0 ]; then
  echo "✅ Cleaned up MCP servers"
  sleep 1
else
  echo "   No MCP servers to clean up"
fi

echo "🚀 Starting bot server..."
npm start >> server.log 2>&1 &

# Wait for startup
sleep 3

# Verify it started
RUNNING=$(ps aux | grep "node server.js" | grep -v grep | wc -l)
if [ "$RUNNING" -eq 1 ]; then
  echo "✅ Bot server restarted successfully!"
  echo "📊 Process: $(ps aux | grep 'node server.js' | grep -v grep | awk '{print $2}')"
else
  echo "❌ Failed to start - found $RUNNING processes running"
  exit 1
fi
