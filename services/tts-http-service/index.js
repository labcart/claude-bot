#!/usr/bin/env node

/**
 * TTS HTTP Service
 *
 * Standalone HTTP server that provides TTS functionality.
 * Runs once globally and serves all MCP Router instances.
 *
 * Original MCP backup: /Users/macbook/play/TTS-mcp-BACKUP
 */

import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Import providers from original TTS MCP
import { GoogleTTSProvider } from '../TTS-mcp/providers/google-tts.js';
import { OpenAITTSProvider } from '../TTS-mcp/providers/openai-tts.js';
import { ElevenLabsTTSProvider } from '../TTS-mcp/providers/elevenlabs-tts.js';
import { requestQueue } from '../TTS-mcp/utils/request-queue.js';
import { logUsage } from '../TTS-mcp/utils/usage-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Load configuration from TTS-mcp
let config;
try {
  const configPath = path.join(__dirname, '../TTS-mcp/config.json');
  const configData = await fs.readFile(configPath, 'utf-8');
  config = JSON.parse(configData);
} catch (error) {
  console.error('❌ Failed to load TTS-mcp config.json:', error.message);
  process.exit(1);
}

// Initialize providers (same as original MCP)
const providers = {};
const defaultProvider = config.provider || 'openai';

if (config.google) {
  providers.google = new GoogleTTSProvider(config.google);
  providers.google.config.output_dir = config.output_dir;
}

if (config.openai) {
  providers.openai = new OpenAITTSProvider(config.openai);
  providers.openai.config.output_dir = config.output_dir;
}

if (config.elevenlabs) {
  providers.elevenlabs = new ElevenLabsTTSProvider(config.elevenlabs);
  providers.elevenlabs.config.output_dir = config.output_dir;
}

const providerNames = Object.keys(providers);
console.log(`🎙️  TTS HTTP Service starting with providers: ${providerNames.join(', ')}`);
console.log(`📌 Default provider: ${defaultProvider}`);

// Create Express app
const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    providers: providerNames,
    defaultProvider
  });
});

// Get tool schema (for MCP Router to register)
app.get('/schema', (req, res) => {
  res.json([
    {
      name: 'text_to_speech',
      description: `Convert text to speech audio using multiple TTS providers (${providerNames.join(', ')}). Returns an audio file path and base64-encoded audio data. Perfect for generating voice messages, audio responses, or accessibility features.`,
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to convert to speech. Can be up to several paragraphs long.',
          },
          provider: {
            type: 'string',
            description: `TTS provider to use: ${providerNames.join(', ')} (default: ${defaultProvider})`,
            enum: providerNames,
          },
          voice: {
            type: 'string',
            description: 'Voice to use. For OpenAI: alloy, echo, fable, onyx, nova, shimmer. For ElevenLabs: voice ID like EXAVITQu4vr4xnSDxMaL (Bella). For Google: en-US-Neural2-F, en-US-Neural2-J, etc.',
          },
          speed: {
            type: 'number',
            description: 'Speaking rate/speed multiplier (0.25-4.0, default: 1.0)',
          },
          include_base64: {
            type: 'boolean',
            description: 'Include base64-encoded audio in response (default: false). Set to true only if needed, as it significantly increases response size.',
          },
          filename: {
            type: 'string',
            description: 'Custom filename prefix (optional). Timestamp will be automatically appended. Example: "welcome" becomes "welcome-1234567890.mp3"',
          },
        },
        required: ['text'],
      },
    },
    {
      name: 'list_tts_voices',
      description: `List available TTS voices for a specific provider`,
      inputSchema: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            description: `TTS provider to list voices for: ${providerNames.join(', ')} (default: ${defaultProvider})`,
            enum: providerNames,
          },
          language_code: {
            type: 'string',
            description: 'Language code filter (e.g., en-US). Only used for Google provider.',
          },
        },
      },
    },
  ]);
});

// Execute text_to_speech tool
app.post('/text_to_speech', async (req, res) => {
  try {
    const { text, provider, voice, speed, include_base64 = false, filename, output_dir } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text parameter is required' });
    }

    // Select provider
    const selectedProvider = provider || defaultProvider;
    const ttsProvider = providers[selectedProvider];

    if (!ttsProvider) {
      return res.status(400).json({
        error: `Provider "${selectedProvider}" not available. Available providers: ${providerNames.join(', ')}`
      });
    }

    // Guard rail: prevent excessive input
    if (text.length > 4096) {
      return res.status(400).json({
        error: `Text too long (${text.length} characters). Maximum: 4096 characters.`
      });
    }

    console.log(`🎤 [HTTP] Generating speech with ${selectedProvider}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

    const startTime = Date.now();

    // Override output directory if provided in request (allows multi-bot usage)
    if (output_dir) {
      console.log(`📂 [HTTP] Using custom output directory: ${output_dir}`);
      ttsProvider.config.output_dir = output_dir;
    }

    // Use queue to prevent concurrent API calls
    const result = await requestQueue.add(async () => {
      return await ttsProvider.generateSpeech({
        text,
        voice,
        speed,
        filename,
      });
    });

    const durationMs = Date.now() - startTime;

    console.log(`✅ [HTTP] Audio generated: ${result.audio_path} (${durationMs}ms)`);

    // Log usage
    await logUsage({
      tool: 'text_to_speech',
      provider: result.provider,
      characterCount: result.character_count,
      voice: result.voice_used,
      filename: filename,
      durationMs: durationMs,
      success: true,
    });

    // Build response
    const response = {
      success: result.success,
      audio_path: result.audio_path,
      format: result.format,
      character_count: result.character_count,
      provider: result.provider,
      voice_used: result.voice_used,
      file_size_bytes: result.file_size_bytes,
    };

    // Only include base64 if requested
    if (include_base64) {
      response.audio_base64 = result.audio_base64;
    }

    res.json(response);

  } catch (error) {
    console.error('❌ [HTTP] TTS error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute list_tts_voices tool
app.post('/list_tts_voices', async (req, res) => {
  try {
    const { provider, language_code } = req.body || {};

    // Select provider
    const selectedProvider = provider || defaultProvider;
    const ttsProvider = providers[selectedProvider];

    if (!ttsProvider) {
      return res.status(400).json({
        error: `Provider "${selectedProvider}" not available. Available providers: ${providerNames.join(', ')}`
      });
    }

    console.log(`📋 [HTTP] Listing available voices for ${selectedProvider}...`);

    const voices = selectedProvider === 'google'
      ? await ttsProvider.listVoices(language_code || 'en-US')
      : await ttsProvider.listVoices();

    res.json(voices);

  } catch (error) {
    console.error('❌ [HTTP] List voices error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.TTS_HTTP_PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 TTS HTTP Service running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Schema: http://localhost:${PORT}/schema`);
  console.log(`\n📦 This is a SHARED service - one instance serves all bots\n`);
});
