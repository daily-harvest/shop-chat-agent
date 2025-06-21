/**
 * Claude Service
 * Manages interactions with the Claude API
 */
import { Anthropic } from "@anthropic-ai/sdk";
import { getCurrentProviderConfig } from "./config.server.js";
import systemPrompts from "../prompts/prompts.json";

/**
 * Creates a Claude service instance
 * @param {Object} options - Configuration options
 * @returns {Object} Claude service with unified interface
 */
export function createClaudeService(options = {}) {
  const config = getCurrentProviderConfig();
  
  if (config.provider !== 'claude') {
    throw new Error('Claude provider not selected in configuration');
  }

  if (!config.apiKey) {
    throw new Error('Claude API key not configured');
  }

  // Initialize Claude client
  const anthropic = new Anthropic({ apiKey: config.apiKey });

  return {
    /**
     * Generate streaming response from Claude
     * @param {Object} params - Request parameters
     * @returns {AsyncGenerator} Streaming response
     */
    async* streamResponse(params) {
      const {
        messages,
        tools = [],
        systemPrompt = null,
        maxTokens = config.maxTokens,
        temperature = 0.7,
        stream
      } = params;

      try {
        // Get system prompt
        const systemInstruction = systemPrompt || getSystemPrompt('standardAssistant');

        console.log('Claude request config:', JSON.stringify({
          model: config.model,
          messageCount: messages.length,
          hasTools: tools.length > 0,
          maxTokens
        }, null, 2));

        if (stream && stream.sendMessage) {
          // Send initial status
          stream.sendMessage({
            type: 'status',
            status: 'Connecting to Claude...'
          });
        }

        // Create stream
        const claudeStream = await anthropic.messages.stream({
          model: config.model,
          max_tokens: maxTokens,
          system: systemInstruction,
          messages,
          tools: tools && tools.length > 0 ? tools : undefined
        });

        let fullResponse = '';
        let toolCalls = [];

        // Handle text chunks
        claudeStream.on('text', (textDelta) => {
          fullResponse += textDelta;
          
          if (stream && stream.sendMessage) {
            stream.sendMessage({
              type: 'content',
              content: textDelta
            });
          }
          
          // Yield content chunk
          // Note: This is a synchronous event, so we can't yield directly
          // We'll collect the text and yield it in the final message
        });

        // Handle content blocks
        claudeStream.on('contentBlock', (contentBlock) => {
          if (contentBlock.type === 'tool_use') {
            toolCalls.push({
              type: 'function',
              function: {
                name: contentBlock.name,
                arguments: JSON.stringify(contentBlock.input || {})
              }
            });
          }
        });

        // Wait for final message
        const finalMessage = await claudeStream.finalMessage();

        // Yield the complete response content
        if (fullResponse) {
          yield {
            type: 'content',
            content: fullResponse
          };
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
          usage: {
            prompt_tokens: finalMessage.usage?.input_tokens || 0,
            completion_tokens: finalMessage.usage?.output_tokens || 0,
            total_tokens: (finalMessage.usage?.input_tokens || 0) + (finalMessage.usage?.output_tokens || 0)
          }
        };

      } catch (error) {
        console.error('Claude API error:', error);
        
        if (stream && stream.sendMessage) {
          stream.sendMessage({
            type: 'error',
            error: `Claude API error: ${error.message}`
          });
        }

        yield {
          type: 'error',
          error: error.message || 'Unknown Claude API error'
        };
      }
    },

    /**
     * Generate non-streaming response from Claude
     * @param {Object} params - Request parameters
     * @returns {Object} Response object
     */
    async generateResponse(params) {
      const {
        messages,
        tools = [],
        systemPrompt = null,
        maxTokens = config.maxTokens,
        temperature = 0.7
      } = params;

      try {
        // Get system prompt
        const systemInstruction = systemPrompt || getSystemPrompt('standardAssistant');

        // Generate content
        const response = await anthropic.messages.create({
          model: config.model,
          max_tokens: maxTokens,
          system: systemInstruction,
          messages,
          tools: tools && tools.length > 0 ? tools : undefined
        });

        // Extract response content
        let content = '';
        const toolCalls = [];

        for (const block of response.content) {
          if (block.type === 'text') {
            content += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input || {})
              }
            });
          }
        }

        return {
          content,
          tool_calls: toolCalls,
          usage: {
            prompt_tokens: response.usage?.input_tokens || 0,
            completion_tokens: response.usage?.output_tokens || 0,
            total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
          }
        };

      } catch (error) {
        console.error('Claude API error:', error);
        throw new Error(`Claude API error: ${error.message}`);
      }
    },

    /**
     * Legacy method for backward compatibility
     * @deprecated Use streamResponse instead
     */
    async streamConversation(params, streamHandlers) {
      console.warn('streamConversation is deprecated, use streamResponse instead');
      
      // Convert to new interface
      const { messages, promptType, tools } = params;
      
      const stream = {
        sendMessage: (data) => {
          if (data.type === 'chunk' && streamHandlers.onText) {
            streamHandlers.onText(data.chunk);
          }
        }
      };

      const responseGenerator = this.streamResponse({
        messages,
        tools,
        systemPrompt: getSystemPrompt(promptType),
        stream
      });

      let finalMessage = { stop_reason: "end_turn" };
      
      for await (const chunk of responseGenerator) {
        if (chunk.type === 'tool_calls' && streamHandlers.onToolUse) {
          for (const toolCall of chunk.tool_calls) {
            await streamHandlers.onToolUse({
              type: 'tool_use',
              id: `tool_${Date.now()}`,
              name: toolCall.function.name,
              input: JSON.parse(toolCall.function.arguments)
            });
          }
        }
        
        if (chunk.type === 'done') {
          finalMessage = { stop_reason: "end_turn", ...chunk };
        }
      }

      return finalMessage;
    }
  };

  /**
   * Gets the system prompt content for a given prompt type
   * @param {string} promptType - The prompt type to retrieve
   * @returns {string} The system prompt content
   */
  function getSystemPrompt(promptType) {
    return systemPrompts.systemPrompts[promptType]?.content ||
      systemPrompts.systemPrompts['standardAssistant'].content;
  }
}

export default createClaudeService;
