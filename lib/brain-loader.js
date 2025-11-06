const path = require('path');
const fs = require('fs');
const securityProfiles = require('./security-profiles');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client if credentials are available
let supabase = null;
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  console.log('✅ Supabase client initialized for BrainLoader');
}

/**
 * BrainLoader
 *
 * Loads and caches brain files (bot personality configurations).
 * Can load from Supabase database or fallback to local brain files.
 * Provides methods to build system prompts for Claude.
 */
class BrainLoader {
  constructor() {
    this.cache = new Map(); // Brain name → brain config
    this.brainsDir = path.join(__dirname, '..', 'brains');
    this.supabaseEnabled = !!supabase;
  }

  /**
   * Load a brain file by name or UUID
   *
   * @param {string} brainName - Name of brain file (without .js extension) or UUID from database
   * @returns {Promise<Object>} Brain configuration object
   * @throws {Error} If brain file doesn't exist or is invalid
   */
  async load(brainName) {
    // Return cached brain if already loaded
    if (this.cache.has(brainName)) {
      return this.cache.get(brainName);
    }

    // Try loading from Supabase first (if enabled and looks like UUID)
    if (this.supabaseEnabled && brainName.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      try {
        const brain = await this.loadFromSupabase(brainName);
        if (brain) {
          this.cache.set(brainName, brain);
          console.log(`✅ Loaded brain from Supabase: ${brain.name} v${brain.version || '1.0'}`);
          return brain;
        }
      } catch (err) {
        console.warn(`⚠️  Failed to load brain from Supabase, falling back to file: ${err.message}`);
      }
    }

    // Fallback to loading from brain file
    return this.loadFromFile(brainName);
  }

  /**
   * Load brain from Supabase database
   *
   * @param {string} botId - Bot UUID from database
   * @returns {Promise<Object|null>} Brain configuration or null if not found
   */
  async loadFromSupabase(botId) {
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase
      .from('bots')
      .select('name, description, system_prompt, version')
      .eq('id', botId)
      .single();

    if (error || !data) {
      return null;
    }

    // Transform database format to brain format
    return {
      name: data.name,
      description: data.description,
      systemPrompt: data.system_prompt.prompt,
      version: data.version || '1.0',
      security: data.system_prompt.security || 'default',
      private: data.system_prompt.private || false
    };
  }

  /**
   * Load brain from local file
   *
   * @param {string} brainName - Name of brain file (without .js extension)
   * @returns {Object} Brain configuration object
   * @throws {Error} If brain file doesn't exist or is invalid
   */
  loadFromFile(brainName) {
    // Construct path to brain file
    const brainPath = path.join(this.brainsDir, `${brainName}.js`);

    // Check if file exists
    if (!fs.existsSync(brainPath)) {
      throw new Error(`Brain file not found: ${brainName}.js (looked in ${this.brainsDir})`);
    }

    // Load the brain file
    let brain;
    try {
      brain = require(brainPath);
    } catch (err) {
      throw new Error(`Failed to load brain file ${brainName}.js: ${err.message}`);
    }

    // Validate required fields
    if (!brain.systemPrompt || typeof brain.systemPrompt !== 'string') {
      throw new Error(`Brain ${brainName} is missing required field: systemPrompt`);
    }

    // Cache and return
    this.cache.set(brainName, brain);
    console.log(`✅ Loaded brain from file: ${brain.name || brainName} v${brain.version || '1.0'}`);

    return brain;
  }

  /**
   * Build full system prompt for Claude
   *
   * Combines brain's systemPrompt with optional contextPrefix.
   * Wraps everything in security layer (if enabled) to prevent leaks.
   *
   * @param {string} brainName - Name of brain to use
   * @param {Object} user - Telegram user object
   * @param {number} user.id - Telegram user ID
   * @param {string} [user.username] - Telegram username
   * @param {string} [user.first_name] - User's first name
   * @returns {Promise<string>} Complete system prompt to inject into conversation
   */
  async buildSystemPrompt(brainName, user) {
    const brain = await this.load(brainName);

    let prompt = '';

    // SECURITY WRAPPER - Load from profile or disable
    // Brain can specify: security: "default" | "strict" | "minimal" | false
    const securitySetting = brain.security !== undefined ? brain.security : 'default';

    if (securitySetting !== false) {
      // Load security profile
      const profile = securityProfiles[securitySetting];

      if (!profile) {
        console.error(`⚠️  Unknown security profile "${securitySetting}" for brain ${brainName}, using default`);
        const defaultProfile = securityProfiles.default;
        prompt += defaultProfile.wrapper;
      } else {
        prompt += profile.wrapper;
      }
    }

    // Add context prefix if brain defines one
    if (brain.contextPrefix && typeof brain.contextPrefix === 'function') {
      try {
        const context = brain.contextPrefix(user);
        if (context) {
          prompt += `${context}\n\n`;
        }
      } catch (err) {
        console.error(`⚠️  Error generating context prefix for brain ${brainName}:`, err.message);
        // Continue without context prefix
      }
    }

    // Add brain's system prompt
    prompt += brain.systemPrompt;

    return prompt;
  }

  /**
   * Get security reminder text for a brain
   *
   * Returns the security reminder to inject with each message.
   * Returns null if security is disabled or profile has no reminder.
   *
   * @param {string} brainName - Name of brain to use
   * @returns {Promise<string|null>} Security reminder text or null
   */
  async getSecurityReminder(brainName) {
    const brain = await this.load(brainName);

    // Check if security is disabled
    const securitySetting = brain.security !== undefined ? brain.security : 'default';
    if (securitySetting === false) {
      return null; // No security, no reminder
    }

    // Load security profile
    const profile = securityProfiles[securitySetting] || securityProfiles.default;

    if (!profile.reminder) {
      return null; // Profile has no reminder
    }

    // Generate reminder (pass bot name if it's a function)
    const botName = brain.name || 'the character defined in your system prompt';
    return typeof profile.reminder === 'function'
      ? profile.reminder(botName)
      : profile.reminder;
  }

  /**
   * Get list of available brain files
   *
   * @returns {Array<string>} Array of brain names (without .js extension)
   */
  listBrains() {
    if (!fs.existsSync(this.brainsDir)) {
      return [];
    }

    return fs.readdirSync(this.brainsDir)
      .filter(file => file.endsWith('.js') && !file.startsWith('_'))
      .map(file => file.replace('.js', ''));
  }

  /**
   * Reload a brain from disk (clear cache)
   *
   * Useful for development when editing brain files.
   *
   * @param {string} brainName - Name of brain to reload
   */
  reload(brainName) {
    // Clear from cache
    this.cache.delete(brainName);

    // Clear from require cache
    const brainPath = path.join(this.brainsDir, `${brainName}.js`);
    delete require.cache[require.resolve(brainPath)];

    console.log(`🔄 Reloaded brain: ${brainName}`);

    // Load fresh version
    return this.load(brainName);
  }
}

module.exports = BrainLoader;
