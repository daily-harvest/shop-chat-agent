/**
 * Gemini Service using Google Gen AI SDK
 * Provides chat functionality using Google's Gemini models
 */

import { GoogleGenAI } from '@google/genai';
import { getCurrentProviderConfig } from './config.server.js';

/**
 * Creates a Gemini service instance with streaming support
 * @param {Object} options - Configuration options
 * @returns {Object} Gemini service instance
 */
export function createGeminiService(options = {}) {
  const config = getCurrentProviderConfig();
  
  if (config.provider !== 'gemini') {
    throw new Error('Gemini provider not selected in configuration');
  }

  if (!config.apiKey) {
    throw new Error('Gemini API key not configured');
  }

  // Initialize Google Gen AI client for Cloudflare Workers
  // Use the server-side configuration with explicit API key
  const genAI = new GoogleGenAI({ apiKey: config.apiKey });
  
  // Note: @google/genai uses different API structure
  // We'll use the models.generateContent method directly

  return {
    /**
     * Generate streaming response from Gemini
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
        // Convert messages to Gemini format
        const contents = convertMessagesToGeminiFormat(messages, systemPrompt);

        // Prepare tools if provided
        const geminiTools = tools.length > 0 ? convertToolsToGeminiFormat(tools) : undefined;

        console.log('Gemini request config:', JSON.stringify({
          model: config.model,
          contentCount: contents.length,
          hasTools: !!geminiTools,
          temperature,
          maxTokens
        }, null, 2));

        if (stream && stream.sendMessage) {
          // Send initial status
          stream.sendMessage({
            type: 'status',
            status: 'Connecting to Gemini...'
          });
        }

        // Generate streaming content using the correct API
        console.log('About to call ai.models.generateContentStream...');
        const response = await genAI.models.generateContentStream({
          model: config.model,
          contents: contents,
          config: {
            temperature: temperature,
            maxOutputTokens: maxTokens,
            topP: config.topP,
            topK: config.topK,
            ...(geminiTools && { tools: [geminiTools] }),
          }
        });
        
        console.log('Response type:', typeof response, 'Response keys:', Object.keys(response || {}));
        console.log('Response structure:', JSON.stringify(response, null, 2));

        let fullResponse = '';
        let toolCalls = [];

        // The @google/genai API returns an async iterable
        try {
          for await (const chunk of response) {
            console.log('Processing chunk:', JSON.stringify(chunk, null, 2));
            
            // The response chunks have a text property directly
            if (chunk.text) {
              fullResponse += chunk.text;
              
              if (stream && stream.sendMessage) {
                stream.sendMessage({
                  type: 'content',
                  content: chunk.text
                });
              }
              
              yield {
                type: 'content',
                content: chunk.text
              };
            }

            // Handle function calls if present
            if (chunk.functionCalls && chunk.functionCalls.length > 0) {
              for (const functionCall of chunk.functionCalls) {
                toolCalls.push({
                  type: 'function',
                  function: {
                    name: functionCall.name,
                    arguments: JSON.stringify(functionCall.args || {})
                  }
                });
              }
            }
          }
        } catch (iterationError) {
          console.log('Direct iteration failed:', iterationError.message);
          console.log('Response type:', typeof response);
          console.log('Response keys:', Object.keys(response || {}));
          
          // If response has a text property directly, use it
          if (response.text) {
            fullResponse = response.text;
            
            if (stream && stream.sendMessage) {
              stream.sendMessage({
                type: 'content',
                content: response.text
              });
            }
            
            yield {
              type: 'content',
              content: response.text
            };
          }
        }

        // Process tool calls if any
        if (toolCalls.length > 0) {
          yield {
            type: 'tool_calls',
            tool_calls: toolCalls
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
          content: fullResponse,
          usage: {
            prompt_tokens: 0, // Gemini doesn't provide detailed token usage in streaming
            completion_tokens: 0,
            total_tokens: 0
          }
        };

      } catch (error) {
        console.error('Gemini API error:', error);
        
        if (stream && stream.sendMessage) {
          stream.sendMessage({
            type: 'error',
            error: `Gemini API error: ${error.message}`
          });
        }

        yield {
          type: 'error',
          error: error.message || 'Unknown Gemini API error'
        };
      }
    },

    /**
     * Generate non-streaming response from Gemini
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
        // Convert messages to Gemini format
        const contents = convertMessagesToGeminiFormat(messages, systemPrompt);

        // Prepare tools if provided
        const geminiTools = tools.length > 0 ? convertToolsToGeminiFormat(tools) : undefined;

        // Generate content using the correct API
        const response = await genAI.models.generateContent({
          model: config.model,
          contents: contents,
          config: {
            temperature: temperature,
            maxOutputTokens: maxTokens,
            topP: config.topP,
            topK: config.topK,
            ...(geminiTools && { tools: [geminiTools] }),
          }
        });

        // Extract response content
        const candidate = response.response.candidates?.[0];
        let content = '';
        const toolCalls = [];

        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.text) {
              content += part.text;
            }

            // Handle function calls
            if (part.functionCall) {
              toolCalls.push({
                type: 'function',
                function: {
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args || {})
                }
              });
            }
          }
        }

        return {
          content,
          tool_calls: toolCalls,
          usage: {
            prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
            completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
            total_tokens: response.usageMetadata?.totalTokenCount || 0
          }
        };

      } catch (error) {
        console.error('Gemini API error:', error);
        throw new Error(`Gemini API error: ${error.message}`);
      }
    }
  };
}

/**
 * Convert chat messages to Gemini format
 * @param {Array} messages - Chat messages
 * @param {string} systemPrompt - System prompt
 * @returns {Array} Gemini-formatted contents
 */
function convertMessagesToGeminiFormat(messages, systemPrompt) {
  const contents = [];

  // Add system instruction if provided
  if (systemPrompt) {
    contents.push({
      role: 'user',
      parts: [{ text: `System: ${systemPrompt}` }]
    });
  }

  // Convert messages
  for (const message of messages) {
    if (message.role === 'system') {
      // Handle system messages
      contents.push({
        role: 'user',
        parts: [{ text: `System: ${message.content}` }]
      });
    } else if (message.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: message.content }]
      });
    } else if (message.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: message.content }]
      });
    } else if (message.role === 'tool') {
      // Handle tool responses
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: message.tool_call_id,
            response: { result: message.content }
          }
        }]
      });
    }
  }

  return contents;
}

/**
 * Convert tools to Gemini format
 * @param {Array} tools - Tool definitions (MCP format)
 * @returns {Object} Gemini-formatted tools
 */
function convertToolsToGeminiFormat(tools) {
  console.log('Converting tools to Gemini format:', JSON.stringify(tools, null, 2));
  
  // Handle both MCP tool format and OpenAI tool format
  const functionDeclarations = tools.map(tool => {
    let parameters = {};
    
    // MCP format: { name, description, input_schema }
    if (tool.name && tool.description && tool.input_schema) {
      parameters = cleanSchemaForGemini(tool.input_schema);
      return {
        name: tool.name,
        description: tool.description,
        parameters: parameters
      };
    }
    // OpenAI format: { function: { name, description, parameters } }
    else if (tool.function && tool.function.name) {
      parameters = cleanSchemaForGemini(tool.function.parameters);
      return {
        name: tool.function.name,
        description: tool.function.description,
        parameters: parameters
      };
    }
    // Fallback - log the unexpected format
    else {
      console.error('Unexpected tool format:', tool);
      return null;
    }
  }).filter(Boolean); // Remove null entries

  return {
    functionDeclarations: functionDeclarations
  };
}

/**
 * Clean schema for Gemini API compatibility
 * Removes unsupported properties like additionalProperties
 * @param {Object} schema - JSON schema
 * @returns {Object} Cleaned schema
 */
function cleanSchemaForGemini(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema;
  }

  console.log('Cleaning schema:', JSON.stringify(schema, null, 2));

  const cleaned = {};

  // Copy supported properties only (explicitly exclude problematic ones)
  const supportedProps = [
    'type', 'description', 'properties', 'required', 'items', 
    'enum', 'minimum', 'maximum', 'minLength', 'maxLength',
    'pattern', 'default', 'title', 'anyOf', 'oneOf', 'allOf'
  ];
  
  // Properties to explicitly exclude
  const excludedProps = [
    'additional_properties', 'additionalProperties', 'unevaluatedProperties',
    '$schema', '$id', 'format'
  ];

  for (const [key, value] of Object.entries(schema)) {
    if (excludedProps.includes(key)) {
      console.log(`Excluding unsupported property: ${key}`);
      continue;
    }
    
    if (supportedProps.includes(key)) {
      if (key === 'properties' && typeof value === 'object') {
        // Recursively clean nested properties
        cleaned[key] = {};
        for (const [propKey, propValue] of Object.entries(value)) {
          cleaned[key][propKey] = cleanSchemaForGemini(propValue);
        }
      } else if (key === 'items') {
        // Clean items in arrays
        cleaned[key] = cleanSchemaForGemini(value);
      } else if (['anyOf', 'oneOf', 'allOf'].includes(key) && Array.isArray(value)) {
        // Clean schema variants
        cleaned[key] = value.map(cleanSchemaForGemini);
      } else {
        cleaned[key] = value;
      }
    } else {
      console.log(`Removing unsupported property: ${key}`);
    }
  }

  console.log('Cleaned schema result:', JSON.stringify(cleaned, null, 2));
  return cleaned;
}

export default createGeminiService; 