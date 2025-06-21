/**
 * Chat API Route
 * Handles chat interactions with Claude API and tools
 */
import { json } from "@remix-run/node";
import EnhancedMCPClient from "../mcp-client-enhanced";
import { saveMessage, getConversationHistory, storeCustomerAccountUrl, getCustomerAccountUrl } from "../db.server";
import AppConfig from "../services/config.server";
import { createSseStream } from "../services/streaming.server";
// Note: AI service imports are handled dynamically in server functions to avoid client-side imports
import { createToolService } from "../services/tool.server";
import { unauthenticated } from "../shopify.server";


/**
 * Remix loader function for handling GET requests
 */
export async function loader({ request }) {
  // Handle OPTIONS requests (CORS preflight)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request)
    });
  }

  const url = new URL(request.url);

  // Handle history fetch requests - matches /chat?history=true&conversation_id=XYZ
  if (url.searchParams.has('history') && url.searchParams.has('conversation_id')) {
    return handleHistoryRequest(request, url.searchParams.get('conversation_id'));
  }

  // Handle SSE requests
  if (!url.searchParams.has('history') && request.headers.get("Accept") === "text/event-stream") {
    return handleChatRequest(request);
  }

  // API-only: reject all other requests
  return json(
    { error: AppConfig.errorMessages.apiUnsupported },
    { status: 400, headers: getCorsHeaders(request) }
  );
}

/**
 * Remix action function for handling POST requests
 */
export async function action({ request }) {
  return handleChatRequest(request);
}

/**
 * Handle history fetch requests
 * @param {Request} request - The request object
 * @param {string} conversationId - The conversation ID
 * @returns {Response} JSON response with chat history
 */
async function handleHistoryRequest(request, conversationId) {
  const messages = await getConversationHistory(conversationId);

  return json(
    { messages },
    { headers: getCorsHeaders(request) }
  );
}

/**
 * Handle chat requests (both GET and POST)
 * @param {Request} request - The request object
 * @returns {Response} Server-sent events stream
 */
async function handleChatRequest(request) {
  try {
    // Get message data from request body
    const body = await request.json();
    const userMessage = body.message;

    // Validate required message
    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: AppConfig.errorMessages.missingMessage }),
        { status: 400, headers: getSseHeaders(request) }
      );
    }

    // Generate or use existing conversation ID
    const conversationId = body.conversation_id || Date.now().toString();
    const promptType = body.prompt_type || AppConfig.api.defaultPromptType;

    // Create a stream for the response
    const responseStream = createSseStream(async (stream) => {
      await handleChatSession({
        request,
        body,
        userMessage,
        conversationId,
        promptType,
        stream
      });
    });

    return new Response(responseStream, {
      headers: getSseHeaders(request)
    });
  } catch (error) {
    console.error('Error in chat request handler:', error);
    return json({ error: error.message }, {
      status: 500,
      headers: getCorsHeaders(request)
    });
  }
}

/**
 * Handle a complete chat session
 * @param {Object} params - Session parameters
 * @param {Request} params.request - The request object
 * @param {string} params.userMessage - The user's message
 * @param {string} params.conversationId - The conversation ID
 * @param {string} params.promptType - The prompt type
 * @param {Object} params.stream - Stream manager for sending responses
 */
async function handleChatSession({
  request,
  body,
  userMessage,
  conversationId,
  promptType,
  stream
}) {
  // Initialize services
  const { createAIService } = await import("../services/ai-provider.server.js");
  const aiService = createAIService();
  const toolService = createToolService();

  // Initialize MCP client
  const shopId = request.headers.get("X-Shopify-Shop-Id");
  let shopDomain = request.headers.get("Origin");
  
  // Fallback: try to get shop domain from request body or URL params
  if (!shopDomain) {
    // Try request body first
    if (body.shop) {
      shopDomain = body.shop.includes('://') ? body.shop : `https://${body.shop}`;
    } else {
      // Try URL parameters
      const url = new URL(request.url);
      const shopParam = url.searchParams.get('shop');
      if (shopParam) {
        shopDomain = shopParam.includes('://') ? shopParam : `https://${shopParam}`;
      } else {
        // Final fallback for testing
        shopDomain = "https://stagingdh.com";
      }
    }
  }
  
  const customerMcpEndpoint = await getCustomerMcpEndpoint(shopDomain, conversationId);
  const mcpClient = new EnhancedMCPClient(
    shopDomain,
    conversationId,
    shopId,
    customerMcpEndpoint,
    {
      debug: true,
      retryAttempts: 3,
      timeout: 30000
    }
  );

  try {
    // Send conversation ID to client
    stream.sendMessage({ type: 'id', conversation_id: conversationId });

    // Connect to MCP servers and get available tools with enhanced error handling
    const connectionResults = await mcpClient.connectToAllServers();
    
    console.log(`Enhanced MCP Connection Results:`, connectionResults);
    console.log(`Total tools available: ${connectionResults.totalTools}`);
    
    // Send connection status to client
    stream.sendMessage({ 
      type: 'mcp_status', 
      status: mcpClient.getConnectionStatus(),
      tools_count: connectionResults.totalTools
    });

    // Prepare conversation state
    let conversationHistory = [];
    let productsToDisplay = [];

    // Save user message to the database
    await saveMessage(conversationId, 'user', userMessage);

    // Fetch all messages from the database for this conversation
    const dbMessages = await getConversationHistory(conversationId);

    // Format messages for Claude API
    conversationHistory = dbMessages.map(dbMessage => {
      let content;
      try {
        content = JSON.parse(dbMessage.content);
      } catch (e) {
        content = dbMessage.content;
      }
      return {
        role: dbMessage.role,
        content
      };
    });

    // Execute the conversation stream using the new unified interface
    let conversationComplete = false;

    try {
      // Use the new streamResponse generator interface
      const responseGenerator = aiService.streamResponse({
        messages: conversationHistory,
        tools: mcpClient.tools,
        stream: stream,
        maxTokens: 2000,
        temperature: 0.7
      });

      for await (const chunk of responseGenerator) {
        if (chunk.type === 'content') {
          // Send content chunks to client
          stream.sendMessage({
            type: 'chunk',
            chunk: chunk.content
          });
        } else if (chunk.type === 'tool_calls') {
          // Handle tool calls
          for (const toolCall of chunk.tool_calls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);
            const toolUseId = `tool_${Date.now()}`;

            // Add missing required parameters for specific tools
            if (toolName === 'search_shop_catalog' && !toolArgs.context) {
              toolArgs.context = 'User is looking for products';
            }

            const toolUseMessage = `Calling tool: ${toolName} with arguments: ${JSON.stringify(toolArgs)}`;

            stream.sendMessage({
              type: 'tool_use',
              tool_use_message: toolUseMessage
            });

            // Call the tool
            const toolUseResponse = await mcpClient.callTool(toolName, toolArgs);

            // Handle tool response based on success/error
            if (toolUseResponse.error) {
              await toolService.handleToolError(
                toolUseResponse,
                toolName,
                toolUseId,
                conversationHistory,
                stream.sendMessage,
                conversationId
              );
            } else {
              await toolService.handleToolSuccess(
                toolUseResponse,
                toolName,
                toolUseId,
                conversationHistory,
                productsToDisplay,
                conversationId
              );
            }

            // Signal new message to client
            stream.sendMessage({ type: 'new_message' });
          }
          
          // After processing all tool calls, continue conversation with updated history
          if (chunk.tool_calls && chunk.tool_calls.length > 0) {
            // Create a new response generator with the updated conversation history
            const continueGenerator = aiService.streamResponse({
              messages: conversationHistory,
              tools: mcpClient.tools,
              stream: stream,
              maxTokens: 2000,
              temperature: 0.7
            });
            
            // Continue processing the conversation
            for await (const continueChunk of continueGenerator) {
              if (continueChunk.type === 'content') {
                stream.sendMessage({
                  type: 'chunk',
                  chunk: continueChunk.content
                });
              } else if (continueChunk.type === 'done') {
                conversationComplete = true;
                if (continueChunk.content) {
                  await saveMessage(conversationId, 'assistant', continueChunk.content);
                }
                console.log('Token usage:', continueChunk.usage);
                break;
              } else if (continueChunk.type === 'error') {
                console.error('AI service error in continuation:', continueChunk.error);
                stream.sendMessage({
                  type: 'error',
                  error: continueChunk.error
                });
                break;
              }
            }
          }
        } else if (chunk.type === 'done') {
          // Conversation completed
          conversationComplete = true;
          
          // Save the final assistant message
          if (chunk.content) {
            await saveMessage(conversationId, 'assistant', chunk.content);
          }
          
          console.log('Token usage:', chunk.usage);
        } else if (chunk.type === 'error') {
          console.error('AI service error:', chunk.error);
          stream.sendMessage({
            type: 'error',
            error: chunk.error
          });
          break;
        }
      }
    } catch (error) {
      console.error('Error in conversation stream:', error);
      stream.sendMessage({
        type: 'error',
        error: `Conversation error: ${error.message}`
      });
    }

    // Signal end of turn
    stream.sendMessage({ type: 'end_turn' });

    // Send product results if available
    if (productsToDisplay.length > 0) {
      stream.sendMessage({
        type: 'product_results',
        products: productsToDisplay
      });
    }
  } catch (error) {
    // The streaming handler takes care of error handling
    throw error;
  }
}

/**
 * Get the customer MCP endpoint for a shop
 * @param {string} shopDomain - The shop domain
 * @param {string} conversationId - The conversation ID
 * @returns {string} The customer MCP endpoint
 */
async function getCustomerMcpEndpoint(shopDomain, conversationId) {
  try {
    return new URL(shopDomain)+ '/customer/api/mcp';
    // Check if the customer account URL exists in the DB
    const existingUrl = await getCustomerAccountUrl(conversationId);

    // If URL exists, return early with the MCP endpoint
    if (existingUrl) {
      return `${existingUrl}/customer/api/mcp`;
    }

    // If not, query for it from the Shopify API
    const { hostname } = new URL(shopDomain);
    const { storefront } = await unauthenticated.storefront(
      hostname
    );

    const response = await storefront.graphql(
      `#graphql#storefront
      query shop {
        shop {
          customerAccountUrl
        }
      }`,
    );

    const body = await response.json();
    const customerAccountUrl = body.data.shop.customerAccountUrl;

    // Store the customer account URL with conversation ID in the DB
    await storeCustomerAccountUrl(conversationId, customerAccountUrl);

    return `${customerAccountUrl}/customer/api/mcp`;
  } catch (error) {
    console.error("Error getting customer MCP endpoint:", error);
    return null;
  }
}

/**
 * Gets CORS headers for the response
 * @param {Request} request - The request object
 * @returns {Object} CORS headers object
 */
function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  const requestHeaders = request.headers.get("Access-Control-Request-Headers") || "Content-Type, Accept";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": requestHeaders,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400" // 24 hours
  };
}

/**
 * Get SSE headers for the response
 * @param {Request} request - The request object
 * @returns {Object} SSE headers object
 */
function getSseHeaders(request) {
  const origin = request.headers.get("Origin") || "*";

  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
    "Access-Control-Allow-Headers": "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  };
}
