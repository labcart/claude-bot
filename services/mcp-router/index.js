#!/usr/bin/env node

/**
 * MCP Router
 *
 * Lightweight MCP server that routes tool calls to shared HTTP services.
 * One instance per Claude CLI session (runs via stdio).
 * Routes to globally shared HTTP services to avoid process explosion.
 *
 * Architecture:
 *   Claude CLI → MCP Router (stdio) → HTTP Services (shared)
 *
 * Benefits:
 *   - Each conversation spawns: 1 Claude CLI + 1 Router = 2 processes
 *   - HTTP services run once globally (shared across all conversations)
 *   - 100 users = 200 processes + 5 services = 205 total (vs 800 with stdio MCPs)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// R2 configuration from environment (passed from claude-client.js)
const R2_UPLOAD_URL = process.env.R2_UPLOAD_URL || 'http://localhost:8080/assets/upload';
const CURRENT_USER_ID = process.env.CURRENT_USER_ID || 'anonymous';
const CURRENT_WORKFLOW_ID = process.env.CURRENT_WORKFLOW_ID || 'general';

// HTTP Service endpoints
// Build services list based on DISABLE_IMAGE_TOOLS env var
const IMAGE_TOOLS = {
  'generate_image': {
    url: 'http://localhost:3002/generate_image',
    schemaUrl: 'http://localhost:3002/schema'
  },
  'edit_image': {
    url: 'http://localhost:3002/edit_image',
    schemaUrl: 'http://localhost:3002/schema'
  },
  'list_image_models': {
    url: 'http://localhost:3002/list_image_models',
    schemaUrl: 'http://localhost:3002/schema'
  }
};

const BASE_SERVICES = {
  // TTS Service
  'text_to_speech': {
    url: 'http://localhost:3001/text_to_speech',
    schemaUrl: 'http://localhost:3001/schema'
  },
  'list_tts_voices': {
    url: 'http://localhost:3001/list_tts_voices',
    schemaUrl: 'http://localhost:3001/schema'
  },

  // Chat Context Service
  'list_sessions': {
    url: 'http://localhost:3003/list_sessions',
    schemaUrl: 'http://localhost:3003/schema'
  },
  'search_sessions': {
    url: 'http://localhost:3003/search_sessions',
    schemaUrl: 'http://localhost:3003/schema'
  },
  'get_session': {
    url: 'http://localhost:3003/get_session',
    schemaUrl: 'http://localhost:3003/schema'
  },
  'nickname_current_session': {
    url: 'http://localhost:3003/nickname_current_session',
    schemaUrl: 'http://localhost:3003/schema'
  },
  'add_tag': {
    url: 'http://localhost:3003/add_tag',
    schemaUrl: 'http://localhost:3003/schema'
  },
  'remove_tag': {
    url: 'http://localhost:3003/remove_tag',
    schemaUrl: 'http://localhost:3003/schema'
  },
  'list_tags': {
    url: 'http://localhost:3003/list_tags',
    schemaUrl: 'http://localhost:3003/schema'
  },
  'list_projects': {
    url: 'http://localhost:3003/list_projects',
    schemaUrl: 'http://localhost:3003/schema'
  },
  'sync_sessions': {
    url: 'http://localhost:3003/sync_sessions',
    schemaUrl: 'http://localhost:3003/schema'
  }
};

// Conditionally include image tools based on environment variable
const HTTP_SERVICES = process.env.DISABLE_IMAGE_TOOLS === 'true'
  ? BASE_SERVICES
  : { ...BASE_SERVICES, ...IMAGE_TOOLS };

const toolsMode = process.env.DISABLE_IMAGE_TOOLS === 'true' ? 'NO IMAGE TOOLS' : 'ALL TOOLS';
console.log(`🔀 MCP Router starting (${toolsMode})...`);
console.log(`   Routing to ${Object.keys(HTTP_SERVICES).length} HTTP services`);

// Create MCP server
const server = new Server(
  {
    name: 'mcp-router',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Cache for tool schemas (fetched from HTTP services on startup)
let cachedTools = [];
let schemasFetched = false;

/**
 * Fetch tool schemas from all HTTP services
 */
async function fetchToolSchemas() {
  if (schemasFetched) return cachedTools;

  console.log('📋 Fetching tool schemas from HTTP services...');
  const tools = [];
  const uniqueSchemaUrls = [...new Set(
    Object.values(HTTP_SERVICES).map(s => s.schemaUrl)
  )];

  for (const schemaUrl of uniqueSchemaUrls) {
    try {
      const response = await fetch(schemaUrl);
      if (!response.ok) {
        console.error(`⚠️  Failed to fetch schema from ${schemaUrl}: ${response.status}`);
        continue;
      }
      const schemas = await response.json();
      tools.push(...schemas);
      console.log(`   ✓ Loaded ${schemas.length} tool(s) from ${schemaUrl}`);
    } catch (error) {
      console.error(`⚠️  Error fetching schema from ${schemaUrl}:`, error.message);
    }
  }

  cachedTools = tools;
  schemasFetched = true;
  console.log(`✅ Registered ${tools.length} total tools`);
  return tools;
}

// Register tool listing handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = await fetchToolSchemas();
  return { tools };
});

// Register tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.log(`🔀 Routing tool call: ${name}`);

  // Find the HTTP service for this tool
  const service = HTTP_SERVICES[name];

  if (!service) {
    const error = `Tool "${name}" not found in router configuration. Available tools: ${Object.keys(HTTP_SERVICES).join(', ')}`;
    console.error(`❌ ${error}`);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error }, null, 2),
        },
      ],
      isError: true,
    };
  }

  try {
    // Forward request to HTTP service
    console.log(`   → Forwarding to ${service.url}`);

    // Build request body with R2 config for media generation tools
    const requestBody = { ...args };

    // For TTS and image tools, pass R2 config so services upload directly
    if (name === 'text_to_speech' || name === 'generate_image' || name === 'edit_image') {
      requestBody.r2_config = {
        upload_url: R2_UPLOAD_URL,
        user_id: CURRENT_USER_ID,
        workflow_id: CURRENT_WORKFLOW_ID
      };
      console.log(`   ☁️  R2 config: user=${CURRENT_USER_ID}, workflow=${CURRENT_WORKFLOW_ID}`);
    }

    const response = await fetch(service.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    console.log(`   ✓ Success (${JSON.stringify(result).length} bytes)`);

    // Return result in MCP format
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };

  } catch (error) {
    console.error(`❌ Error routing ${name}:`, error.message);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            tool: name,
            service: service.url
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Connect to Claude CLI via stdio
const transport = new StdioServerTransport();
await server.connect(transport);

console.log('✅ MCP Router connected and ready');
