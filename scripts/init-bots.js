#!/usr/bin/env node

/**
 * Bot Initialization Script
 *
 * Fetches available agents from marketplace_agents table and creates
 * user instances in my_agents table.
 * Generates bots.json from the agent records.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = require('../lib/supabase-client');

const BOTS_JSON_PATH = path.join(__dirname, '..', 'bots.json');
const USER_ID = process.env.USER_ID;

if (!USER_ID) {
  console.error('❌ USER_ID not found in .env');
  console.error('   Please configure your .env file first');
  process.exit(1);
}

/**
 * Fetch public agents from marketplace_agents table
 */
async function getMarketplaceAgents() {
  const { data, error } = await supabase
    .from('marketplace_agents')
    .select('*')
    .eq('visibility', 'public')
    .eq('is_active', true);

  if (error) {
    throw new Error(`Failed to fetch marketplace agents: ${error.message}`);
  }

  return data || [];
}

/**
 * Fetch user's existing agent instances from my_agents table
 */
async function getMyAgents() {
  const { data, error } = await supabase
    .from('my_agents')
    .select('*')
    .eq('user_id', USER_ID);

  if (error) {
    throw new Error(`Failed to fetch user agents: ${error.message}`);
  }

  return data || [];
}

/**
 * Create an agent instance for the user in my_agents table
 */
async function createAgentInstance(agent) {
  const instanceData = {
    user_id: USER_ID,
    agent_id: agent.id,
    instance_name: agent.name,
    instance_slug: agent.slug,
    config_overrides: {},
    agent_type: agent.agent_type || 'personality',
    capabilities: agent.capabilities || []
  };

  const { data, error } = await supabase
    .from('my_agents')
    .insert(instanceData)
    .select()
    .single();

  if (error) {
    // Check if it's a duplicate key error
    if (error.code === '23505') {
      console.log(`   ⏭️  Skipped ${agent.name} (already exists)`);
      return null;
    }
    throw new Error(`Failed to create agent instance: ${error.message}`);
  }

  return data;
}

/**
 * Generate bots.json from agent records
 *
 * Maps marketplace agent format to the legacy bots.json format
 * for backward compatibility with the bot manager.
 */
function generateBotsJson(agents, instances) {
  // Create a map of instance_slug -> instance for quick lookup
  const instanceMap = new Map(instances.map(i => [i.instance_slug, i]));

  const botsConfig = agents
    .filter(agent => instanceMap.has(agent.slug))
    .map(agent => {
      const instance = instanceMap.get(agent.slug);
      const brainConfig = agent.brain_config || {};

      return {
        id: agent.slug,
        name: agent.name,
        systemPrompt: brainConfig.systemPrompt || '',
        workspace: process.cwd(),
        webOnly: true,
        active: true,
        // Include marketplace agent metadata
        agentId: agent.id,
        instanceId: instance.id,
        capabilities: agent.capabilities || [],
        agentType: agent.agent_type || 'personality'
      };
    });

  fs.writeFileSync(BOTS_JSON_PATH, JSON.stringify(botsConfig, null, 2));
  console.log(`✅ Generated bots.json with ${botsConfig.length} bots`);
}

/**
 * Main initialization
 */
async function init() {
  console.log('🚀 Initializing bots for user:', USER_ID);
  console.log('');

  // 1. Fetch marketplace agents
  console.log('📂 Fetching marketplace agents...');
  const marketplaceAgents = await getMarketplaceAgents();
  console.log(`   Found ${marketplaceAgents.length} public agents`);
  console.log('');

  // 2. Check existing instances
  console.log('🔍 Checking existing agent instances...');
  let existingInstances = await getMyAgents();
  const existingSlugs = new Set(existingInstances.map(i => i.instance_slug));
  console.log(`   Found ${existingInstances.length} existing instances`);
  console.log('');

  // 3. Create instances for any marketplace agents that don't exist yet
  console.log('📦 Creating agent instances...');
  let created = 0;
  let skipped = 0;

  for (const agent of marketplaceAgents) {
    if (existingSlugs.has(agent.slug)) {
      console.log(`   ⏭️  Skipped ${agent.name} (already exists)`);
      skipped++;
      continue;
    }

    try {
      const instance = await createAgentInstance(agent);
      if (instance) {
        console.log(`   ✅ Created ${agent.name} (${agent.slug})`);
        existingInstances.push(instance);
        created++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`   ❌ Failed to create ${agent.name}:`, err.message);
    }
  }

  console.log('');
  console.log(`📊 Summary:`);
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total instances: ${existingInstances.length}`);
  console.log('');

  // 4. Generate bots.json
  console.log('📝 Generating bots.json...');
  generateBotsJson(marketplaceAgents, existingInstances);
  console.log('');

  console.log('✨ Initialization complete!');
  console.log('');
  console.log('Next steps:');
  console.log('   1. Review bots.json to verify configuration');
  console.log('   2. Start the bot server: npm start');
  console.log('');
}

// Run initialization
init().catch(err => {
  console.error('');
  console.error('❌ Initialization failed:', err.message);
  console.error('Stack trace:', err.stack);
  console.error('');
  process.exit(1);
});
