/**
 * Cloudflare Workers AI Service
 * Provides chat functionality using Cloudflare's Workers AI platform
 */

import { getCurrentProviderConfig } from './config.server.js';

/**
 * Creates a Cloudflare Workers AI service instance
 * @param {Object} options - Configuration options
 * @returns {Object} Cloudflare AI service instance
 */
export function createCloudflareService(options = {}) {
  const config = getCurrentProviderConfig();
  
  if (config.provider !== 'cloudflare') {
    throw new Error('Cloudflare provider not selected in configuration');
  }

  // Get Cloudflare AI binding from the environment
  // In Cloudflare Workers, the AI binding is passed through options or context
  const ai = options.ai || options.env?.AI;
  
  if (!ai) {
    throw new Error('Cloudflare AI binding not available. Make sure AI binding is configured in wrangler.toml and passed to the service.');
  }

  return {
    /**
     * Generate streaming response from Cloudflare Workers AI
     * @param {Object} params - Request parameters
     * @returns {AsyncGenerator} Streaming response
     */
    async* streamResponse(params) {
      const {
        messages,
        tools = [],
        systemPrompt = null,
        maxTokens = config.maxTokens,
        temperature = config.temperature,
        stream
      } = params;

      try {
        // Convert messages to Cloudflare format
        const cfMessages = convertMessagesToCloudflareFormat(messages, systemPrompt);

        // Configure generation parameters
        const requestConfig = {
          messages: cfMessages,
          max_tokens: maxTokens,
          temperature: temperature,
          stream: true
        };

        console.log('Cloudflare AI request config:', JSON.stringify({
          model: config.model,
          messageCount: cfMessages.length,
          hasTools: tools.length > 0,
          temperature,
          maxTokens
        }, null, 2));

        if (stream && stream.sendMessage) {
          // Send initial status
          stream.sendMessage({
            type: 'status',
            status: 'Connecting to Cloudflare Workers AI...'
          });
        }

        // Generate streaming content
        const response = await ai.run(config.model, requestConfig);

        let fullResponse = '';

        // Handle streaming response
        if (response && typeof response[Symbol.asyncIterator] === 'function') {
          // Streaming response
          for await (const chunk of response) {
            if (chunk.response) {
              fullResponse += chunk.response;
              
              if (stream && stream.sendMessage) {
                stream.sendMessage({
                  type: 'content',
                  content: chunk.response
                });
              }
              
              yield {
                type: 'content',
                content: chunk.response
              };
            }
          }
        } else {
          // Non-streaming response fallback
          const content = response.response || response.result || '';
          fullResponse = content;
          
          if (stream && stream.sendMessage) {
            stream.sendMessage({
              type: 'content',
              content: content
            });
          }
          
          yield {
            type: 'content',
            content: content
          };
        }

        // Send completion status
        if (stream && stream.sendMessage) {
          stream.sendMessage({
            type: 'status',
            status: 'Response completed'
          });
        }

        yield {
          type: 'done',
          usage: {
            prompt_tokens: 0, // Cloudflare doesn't provide detailed token usage
            completion_tokens: 0,
            total_tokens: 0
          }
        };

      } catch (error) {
        console.error('Cloudflare AI error:', error);
        
        if (stream && stream.sendMessage) {
          stream.sendMessage({
            type: 'error',
            error: `Cloudflare AI error: ${error.message}`
          });
        }

        yield {
          type: 'error',
          error: error.message || 'Unknown Cloudflare AI error'
        };
      }
    },

    /**
     * Generate non-streaming response from Cloudflare Workers AI
     * @param {Object} params - Request parameters
     * @returns {Object} Response object
     */
    async generateResponse(params) {
      const {
        messages,
        tools = [],
        systemPrompt = null,
        maxTokens = config.maxTokens,
        temperature = config.temperature
      } = params;

      try {
        // Convert messages to Cloudflare format
        const cfMessages = convertMessagesToCloudflareFormat(messages, systemPrompt);

        // Configure generation parameters
        const requestConfig = {
          messages: cfMessages,
          max_tokens: maxTokens,
          temperature: temperature,
          stream: false
        };

        // Generate content
        const response = await ai.run(config.model, requestConfig);

        // Extract response content
        const content = response.response || response.result || '';

        return {
          content,
          tool_calls: [], // Most CF models don't support function calling yet
          usage: {
            prompt_tokens: 0, // Cloudflare doesn't provide detailed token usage
            completion_tokens: 0,
            total_tokens: 0
          }
        };

      } catch (error) {
        console.error('Cloudflare AI error:', error);
        throw new Error(`Cloudflare AI error: ${error.message}`);
      }
    },

    /**
     * List available models in Cloudflare Workers AI
     * @returns {Array} Available models
     */
    async listModels() {
      try {
        // Common Cloudflare Workers AI models
        return [
          // Google models
          { id: '@cf/google/gemma-7b-it', name: 'Gemma 7B Instruct' },
          { id: '@cf/google/gemma-2b-it', name: 'Gemma 2B Instruct' },
          
          // Meta models
          { id: '@cf/meta/llama-2-7b-chat-int8', name: 'Llama 2 7B Chat' },
          { id: '@cf/meta/llama-3-8b-instruct', name: 'Llama 3 8B Instruct' },
          { id: '@cf/meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct' },
          
          // Microsoft models
          { id: '@cf/microsoft/phi-2', name: 'Phi-2' },
          
          // Mistral models
          { id: '@cf/mistral/mistral-7b-instruct-v0.1', name: 'Mistral 7B Instruct' },
          
          // OpenChat models
          { id: '@cf/openchat/openchat-3.5-0106', name: 'OpenChat 3.5' },
          
          // TinyLlama models
          { id: '@cf/tinyllama/tinyllama-1.1b-chat-v1.0', name: 'TinyLlama 1.1B Chat' }
        ];
      } catch (error) {
        console.error('Error listing Cloudflare models:', error);
        return [];
      }
    }
  };
}

/**
 * Convert chat messages to Cloudflare Workers AI format
 * @param {Array} messages - Chat messages
 * @param {string} systemPrompt - System prompt
 * @returns {Array} Cloudflare-formatted messages
 */
function convertMessagesToCloudflareFormat(messages, systemPrompt) {
  const cfMessages = [];

  // Add system prompt if provided
  if (systemPrompt) {
    cfMessages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  // Convert messages
  for (const message of messages) {
    if (message.role === 'system') {
      cfMessages.push({
        role: 'system',
        content: message.content
      });
    } else if (message.role === 'user') {
      cfMessages.push({
        role: 'user',
        content: message.content
      });
    } else if (message.role === 'assistant') {
      cfMessages.push({
        role: 'assistant',
        content: message.content
      });
    }
    // Note: Cloudflare doesn't support tool messages in most models yet
  }

  return cfMessages;
}

export default createCloudflareService; 