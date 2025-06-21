/**
 * Unified AI Provider Factory
 * Dynamically creates AI service instances based on configuration
 */

import { createClaudeService } from './claude.server.js';
import { createGeminiService } from './gemini.server.js';
import { createCloudflareService } from './cloudflare.server.js';
import { getCurrentProviderConfig, validateProviderConfig } from './config.server.js';

/**
 * Create an AI service instance based on current configuration
 * @param {Object} options - Configuration options
 * @returns {Object} AI service instance
 */
export function createAIService(options = {}) {
  try {
    // Validate configuration
    validateProviderConfig();
    
    const config = getCurrentProviderConfig();
    
    console.log(`Creating AI service for provider: ${config.provider}`);
    
    switch (config.provider) {
      case 'claude':
        return createClaudeService(options);
      
      case 'gemini':
        return createGeminiService(options);
      
      case 'cloudflare':
        return createCloudflareService(options);
      
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  } catch (error) {
    console.error('Error creating AI service:', error);
    throw error;
  }
}

/**
 * Get information about the current AI provider
 * @returns {Object} Provider information
 */
export function getCurrentProviderInfo() {
  const config = getCurrentProviderConfig();
  
  return {
    provider: config.provider,
    model: config.model,
    features: config.features,
    maxTokens: config.maxTokens,
    supportsStreaming: config.features.supportsStreaming,
    supportsTools: config.features.supportsTools,
    supportsVision: config.features.supportsVision,
    maxContextLength: config.features.maxContextLength
  };
}

/**
 * List all available AI providers and their status
 * @returns {Array} Provider status list
 */
export function listProviders() {
  const providers = [
    {
      name: 'claude',
      displayName: 'Claude (Anthropic)',
      available: !!process.env.CLAUDE_API_KEY,
      models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229'],
      features: {
        streaming: true,
        tools: true,
        vision: true,
        systemPrompts: true
      }
    },
    {
      name: 'gemini',
      displayName: 'Gemini (Google)',
      available: !!process.env.GEMINI_API_KEY,
      models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
      features: {
        streaming: true,
        tools: true,
        vision: true,
        systemPrompts: true
      }
    },
    {
      name: 'cloudflare',
      displayName: 'Cloudflare Workers AI',
      available: true, // Always available in CF Workers environment
      models: [
        '@cf/google/gemma-7b-it',
        '@cf/google/gemma-2b-it',
        '@cf/meta/llama-3.1-8b-instruct',
        '@cf/meta/llama-3-8b-instruct',
        '@cf/mistral/mistral-7b-instruct-v0.1'
      ],
      features: {
        streaming: true,
        tools: false, // Most models don't support tools yet
        vision: false, // Most models don't support vision yet
        systemPrompts: true
      }
    }
  ];

  return providers;
}

/**
 * Switch to a different AI provider
 * @param {string} provider - Provider name ('claude', 'gemini', 'cloudflare')
 * @param {Object} options - Additional options
 * @returns {Object} New AI service instance
 */
export function switchProvider(provider, options = {}) {
  // Temporarily override the provider
  const originalProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = provider;
  
  try {
    const service = createAIService(options);
    console.log(`Successfully switched to provider: ${provider}`);
    return service;
  } catch (error) {
    // Restore original provider on error
    if (originalProvider) {
      process.env.AI_PROVIDER = originalProvider;
    } else {
      delete process.env.AI_PROVIDER;
    }
    throw error;
  }
}

/**
 * Test connection to a specific provider
 * @param {string} provider - Provider name
 * @param {Object} options - Test options
 * @returns {Object} Test result
 */
export async function testProvider(provider, options = {}) {
  const originalProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = provider;
  
  try {
    const service = createAIService(options);
    
    // Test with a simple message
    const testMessage = 'Hello, this is a test message. Please respond with "Test successful".';
    const response = await service.generateResponse({
      messages: [{ role: 'user', content: testMessage }]
    });
    
    // Restore original provider
    if (originalProvider) {
      process.env.AI_PROVIDER = originalProvider;
    } else {
      delete process.env.AI_PROVIDER;
    }
    
    return {
      success: true,
      provider,
      response: response.content,
      usage: response.usage
    };
  } catch (error) {
    // Restore original provider
    if (originalProvider) {
      process.env.AI_PROVIDER = originalProvider;
    } else {
      delete process.env.AI_PROVIDER;
    }
    
    return {
      success: false,
      provider,
      error: error.message
    };
  }
}

/**
 * Get recommended provider based on use case
 * @param {string} useCase - Use case ('chat', 'analysis', 'coding', 'creative')
 * @returns {string} Recommended provider
 */
export function getRecommendedProvider(useCase = 'chat') {
  const providers = listProviders();
  const availableProviders = providers.filter(p => p.available);
  
  if (availableProviders.length === 0) {
    throw new Error('No AI providers are available. Please configure at least one provider.');
  }
  
  switch (useCase) {
    case 'analysis':
    case 'reasoning':
      // Prefer Claude for analysis tasks
      return availableProviders.find(p => p.name === 'claude')?.name || 
             availableProviders.find(p => p.name === 'gemini')?.name || 
             availableProviders[0].name;
    
    case 'coding':
      // Prefer Gemini for coding tasks
      return availableProviders.find(p => p.name === 'gemini')?.name || 
             availableProviders.find(p => p.name === 'claude')?.name || 
             availableProviders[0].name;
    
    case 'creative':
      // Any provider works for creative tasks
      return availableProviders.find(p => p.name === 'claude')?.name || 
             availableProviders.find(p => p.name === 'gemini')?.name || 
             availableProviders[0].name;
    
    case 'chat':
    default:
      // For general chat, use the first available provider
      return availableProviders[0].name;
  }
}

export default createAIService; 