/**
 * Configuration Service
 * Centralizes all configuration values for the chat service
 */

export const AppConfig = {
  // AI Provider Configuration
  ai: {
    // Current provider: 'claude', 'gemini', or 'cloudflare'
    provider: process.env.AI_PROVIDER || 'claude',
    
    // Claude Configuration
    claude: {
      model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
      maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 2000,
      apiKey: process.env.CLAUDE_API_KEY,
    },
    
    // Gemini Configuration (Google Gen AI SDK)
    gemini: {
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS) || 2000,
      apiKey: process.env.GEMINI_API_KEY,
      temperature: parseFloat(process.env.GEMINI_TEMPERATURE) || 0.7,
      topP: parseFloat(process.env.GEMINI_TOP_P) || 0.9,
      topK: parseInt(process.env.GEMINI_TOP_K) || 40,
    },
    
    // Cloudflare Workers AI Configuration
    cloudflare: {
      model: process.env.CLOUDFLARE_AI_MODEL || '@cf/google/gemma-7b-it',
      maxTokens: parseInt(process.env.CLOUDFLARE_MAX_TOKENS) || 2000,
      temperature: parseFloat(process.env.CLOUDFLARE_TEMPERATURE) || 0.7,
    },
    
    // Fallback Configuration
    defaultPromptType: 'standardAssistant',
  },

  // Legacy API Configuration (for backward compatibility)
  api: {
    defaultModel: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
    maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 2000,
    defaultPromptType: 'standardAssistant',
  },

  // Error Message Templates
  errorMessages: {
    missingMessage: "Message is required",
    apiUnsupported: "This endpoint only supports server-sent events (SSE) requests or history requests.",
    authFailed: "Authentication failed with AI provider",
    apiKeyError: "Please check your API key in environment variables",
    rateLimitExceeded: "Rate limit exceeded",
    rateLimitDetails: "Please try again later",
    genericError: "Failed to get response from AI provider",
    unsupportedProvider: "Unsupported AI provider specified",
    providerNotConfigured: "AI provider not properly configured"
  },

  // Tool Configuration
  tools: {
    productSearchName: "search_shop_catalog",
    maxProductsToDisplay: 3
  },

  // Provider-specific features
  features: {
    claude: {
      supportsStreaming: true,
      supportsTools: true,
      supportsSystemPrompts: true,
      supportsVision: true,
      maxContextLength: 200000,
    },
    gemini: {
      supportsStreaming: true,
      supportsTools: true,
      supportsSystemPrompts: true,
      supportsVision: true,
      maxContextLength: 1048576, // 1M tokens
    },
    cloudflare: {
      supportsStreaming: true,
      supportsTools: false, // Most CF models don't support function calling yet
      supportsSystemPrompts: true,
      supportsVision: false, // Depends on the specific model
      maxContextLength: 8192,
    }
  }
};

/**
 * Get the current AI provider configuration
 * @returns {Object} Current provider config
 */
export function getCurrentProviderConfig() {
  const provider = AppConfig.ai.provider;
  const config = AppConfig.ai[provider];
  
  if (!config) {
    throw new Error(`Invalid AI provider: ${provider}`);
  }
  
  return {
    provider,
    ...config,
    features: AppConfig.features[provider]
  };
}

/**
 * Validate that the current provider is properly configured
 * @returns {boolean} True if valid, throws error if not
 */
export function validateProviderConfig() {
  const { provider, apiKey } = getCurrentProviderConfig();
  
  // Check if API key is required and present
  if (provider !== 'cloudflare' && !apiKey) {
    throw new Error(`API key required for ${provider} provider`);
  }
  
  return true;
}

export default AppConfig;
