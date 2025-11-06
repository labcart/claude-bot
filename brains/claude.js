/**
 * Claude Brain - Direct Access
 *
 * This is a minimal brain that provides direct access to Claude
 * without any personality wrapper or custom instructions.
 * Used for the main Claude bot in the web UI.
 */

module.exports = {
  name: "Claude",
  version: "1.0",
  description: "Direct access to Claude without personality wrapper",

  /**
   * System Prompt - Minimal, just basic identity
   */
  systemPrompt: `You are Claude, an AI assistant created by Anthropic.

You are helpful, harmless, and honest. You engage in thoughtful conversation and provide accurate information to the best of your abilities.`,

  /**
   * No context prefix - keep it minimal
   */
  contextPrefix: null,

  /**
   * Response parameters
   */
  maxTokens: 1000,
  temperature: 0.7,

  /**
   * Rate limits
   */
  rateLimits: {
    free: 100,
    paid: 10000
  },

  /**
   * TTS disabled for main Claude
   */
  tts: {
    enabled: false
  },

  /**
   * Private bot - web UI only
   */
  private: true
};
