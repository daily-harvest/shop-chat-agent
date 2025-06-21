import { generateAuthUrl } from "./auth.server";
import { getCustomerToken } from "./db.server";

/**
 * Enhanced MCP Client that can work with both server-side and client-side approaches
 * Uses improved error handling, reconnection logic, and can integrate with use-mcp library
 */
class EnhancedMCPClient {
  /**
   * Creates a new EnhancedMCPClient instance.
   *
   * @param {string} hostUrl - The base URL for the shop
   * @param {string} conversationId - ID for the current conversation
   * @param {string} shopId - ID of the Shopify shop
   * @param {string} customerMcpEndpoint - Customer MCP endpoint URL
   * @param {Object} options - Configuration options
   */
  constructor(hostUrl, conversationId, shopId, customerMcpEndpoint, options = {}) {
    this.tools = [];
    this.customerTools = [];
    this.storefrontTools = [];
    this.hostUrl = hostUrl;
    this.conversationId = conversationId;
    this.shopId = shopId;
    this.customerAccessToken = "";
    
    // Use provided endpoint or construct default ones
    this.storefrontMcpEndpoint = options.storefrontMcpEndpoint || `${hostUrl}/api/mcp`;
    
    const accountHostUrl = hostUrl.replace(/(\.myshopify\.com)$/, '.account$1').replace('://', '://account.');
    this.customerMcpEndpoint = customerMcpEndpoint || `${accountHostUrl}/customer/api/mcp`;
    
    // Configuration options
    this.options = {
      retryAttempts: 3,
      retryDelay: 1000,
      timeout: 30000,
      debug: false,
      ...options
    };
    
    // Connection state
    this.connectionState = {
      storefront: 'disconnected',
      customer: 'disconnected'
    };
    
    // Event listeners
    this.eventListeners = {
      'connection-state-change': [],
      'tools-updated': [],
      'error': []
    };
  }

  /**
   * Add event listener
   */
  addEventListener(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(event, callback) {
    if (this.eventListeners[event]) {
      const index = this.eventListeners[event].indexOf(callback);
      if (index > -1) {
        this.eventListeners[event].splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Update connection state and emit event
   */
  updateConnectionState(server, state) {
    const previousState = { ...this.connectionState };
    this.connectionState[server] = state;
    
    this.emit('connection-state-change', {
      server,
      state,
      previousState,
      currentState: { ...this.connectionState }
    });
    
    if (this.options.debug) {
      console.log(`MCP ${server} connection state changed: ${state}`);
    }
  }

  /**
   * Make a JSON-RPC request with retry logic and better error handling
   */
  async _makeJsonRpcRequestWithRetry(endpoint, method, params, headers, attempt = 1) {
    try {
      return await this._makeJsonRpcRequest(endpoint, method, params, headers);
    } catch (error) {
      if (attempt < this.options.retryAttempts) {
        const delay = this.options.retryDelay * attempt;
        
        if (this.options.debug) {
          console.log(`Retrying request to ${endpoint} in ${delay}ms (attempt ${attempt + 1}/${this.options.retryAttempts})`);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._makeJsonRpcRequestWithRetry(endpoint, method, params, headers, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * Makes a JSON-RPC request with timeout support
   */
  async _makeJsonRpcRequest(endpoint, method, params, headers) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);
    
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: method,
          id: Date.now(),
          params: params
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Request failed: ${response.status} ${errorText}`);
        error.status = response.status;
        error.response = response;
        throw error;
      }

      const result = await response.json();
      
      // Handle JSON-RPC errors
      if (result.error) {
        const error = new Error(`JSON-RPC Error: ${result.error.message || 'Unknown error'}`);
        error.code = result.error.code;
        error.data = result.error.data;
        throw error;
      }
      
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.options.timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Connects to the customer MCP server with enhanced error handling
   */
  async connectToCustomerServer() {
    try {
      this.updateConnectionState('customer', 'connecting');
      
      if (this.options.debug) {
        console.log(`Connecting to customer MCP server at ${this.customerMcpEndpoint}`);
      }

      // Get token from database if conversation ID is available
      if (this.conversationId) {
        const dbToken = await getCustomerToken(this.conversationId);
        if (dbToken && dbToken.accessToken) {
          this.customerAccessToken = dbToken.accessToken;
        } else {
          console.log("No token in database for conversation:", this.conversationId);
          this.updateConnectionState('customer', 'requires-auth');
          return [];
        }
      }

      const headers = {
        "Authorization": this.customerAccessToken || ""
      };

      const response = await this._makeJsonRpcRequestWithRetry(
        this.customerMcpEndpoint,
        "tools/list",
        {},
        headers
      );

      const toolsData = response.result && response.result.tools ? response.result.tools : [];
      const customerTools = this._formatToolsData(toolsData);

      this.customerTools = customerTools;
      this.tools = [...this.storefrontTools, ...customerTools];
      
      this.updateConnectionState('customer', 'ready');
      this.emit('tools-updated', { tools: this.tools, server: 'customer' });

      if (this.options.debug) {
        console.log(`Successfully connected to customer MCP server with ${customerTools.length} tools`);
      }

      return customerTools;
    } catch (error) {
      this.updateConnectionState('customer', 'failed');
      this.emit('error', { server: 'customer', error, operation: 'connect' });
      
      console.error("Failed to connect to customer MCP server:", error);
      
      // Don't throw, just return empty array to allow storefront tools to work
      return [];
    }
  }

  /**
   * Connects to the storefront MCP server with enhanced error handling
   */
  async connectToStorefrontServer() {
    try {
      this.updateConnectionState('storefront', 'connecting');
      
      if (this.options.debug) {
        console.log(`Connecting to storefront MCP server at ${this.storefrontMcpEndpoint}`);
      }

      const response = await this._makeJsonRpcRequestWithRetry(
        this.storefrontMcpEndpoint,
        "tools/list",
        {},
        {}
      );

      const toolsData = response.result && response.result.tools ? response.result.tools : [];
      const storefrontTools = this._formatToolsData(toolsData);

      this.storefrontTools = storefrontTools;
      this.tools = [...storefrontTools, ...this.customerTools];
      
      this.updateConnectionState('storefront', 'ready');
      this.emit('tools-updated', { tools: this.tools, server: 'storefront' });

      if (this.options.debug) {
        console.log(`Successfully connected to storefront MCP server with ${storefrontTools.length} tools`);
      }

      return storefrontTools;
    } catch (error) {
      this.updateConnectionState('storefront', 'failed');
      this.emit('error', { server: 'storefront', error, operation: 'connect' });
      
      console.error("Failed to connect to storefront MCP server:", error);
      throw error;
    }
  }

  /**
   * Connect to both servers with better error handling
   */
  async connectToAllServers() {
    const results = await Promise.allSettled([
      this.connectToStorefrontServer(),
      this.connectToCustomerServer()
    ]);
    
    const storefrontResult = results[0];
    const customerResult = results[1];
    
    if (storefrontResult.status === 'rejected') {
      console.error('Storefront MCP connection failed:', storefrontResult.reason);
    }
    
    if (customerResult.status === 'rejected') {
      console.error('Customer MCP connection failed:', customerResult.reason);
    }
    
    return {
      storefront: storefrontResult.status === 'fulfilled' ? storefrontResult.value : [],
      customer: customerResult.status === 'fulfilled' ? customerResult.value : [],
      totalTools: this.tools.length
    };
  }

  /**
   * Enhanced tool calling with better error handling and retry logic
   */
  async callTool(toolName, toolArgs) {
    try {
      if (this.customerTools.some(tool => tool.name === toolName)) {
        return await this.callCustomerTool(toolName, toolArgs);
      } else if (this.storefrontTools.some(tool => tool.name === toolName)) {
        return await this.callStorefrontTool(toolName, toolArgs);
      } else {
        return {
          error: {
            type: "tool_not_found",
            data: `Tool ${toolName} not found in any connected MCP server`
          }
        };
      }
    } catch (error) {
      this.emit('error', { operation: 'tool-call', toolName, error });
      return {
        error: {
          type: "internal_error",
          data: `Error calling tool ${toolName}: ${error.message}`
        }
      };
    }
  }

  /**
   * Enhanced storefront tool calling
   */
  async callStorefrontTool(toolName, toolArgs) {
    try {
      if (this.options.debug) {
        console.log("Calling storefront tool", toolName, toolArgs);
      }

      const response = await this._makeJsonRpcRequestWithRetry(
        this.storefrontMcpEndpoint,
        "tools/call",
        {
          name: toolName,
          arguments: toolArgs,
        },
        {}
      );

      return response.result || response;
    } catch (error) {
      console.error(`Error calling storefront tool ${toolName}:`, error);
      return {
        error: {
          type: "internal_error",
          data: `Error calling tool ${toolName}: ${error.message}`
        }
      };
    }
  }

  /**
   * Enhanced customer tool calling with auth handling
   */
  async callCustomerTool(toolName, toolArgs) {
    try {
      if (this.options.debug) {
        console.log("Calling customer tool", toolName, toolArgs);
      }

      // Ensure we have a valid token
      let accessToken = this.customerAccessToken;

      if (!accessToken || accessToken === "") {
        const dbToken = await getCustomerToken(this.conversationId);
        if (dbToken && dbToken.accessToken) {
          accessToken = dbToken.accessToken;
          this.customerAccessToken = accessToken;
        } else {
          console.log("No token in database for conversation:", this.conversationId);
        }
      }

      const headers = {
        "Authorization": accessToken
      };

      try {
        const response = await this._makeJsonRpcRequestWithRetry(
          this.customerMcpEndpoint,
          "tools/call",
          {
            name: toolName,
            arguments: toolArgs,
          },
          headers
        );

        return response.result || response;
      } catch (error) {
        // Handle 401 specifically to trigger authentication
        if (error.status === 401) {
          console.log("Unauthorized, generating authorization URL for customer");

          const authResponse = await generateAuthUrl(this.conversationId, this.shopId);

          return {
            error: {
              type: "auth_required",
              data: `You need to authorize the app to access your customer data. [Click here to authorize](${authResponse.url})`
            }
          };
        }

        throw error;
      }
    } catch (error) {
      console.error(`Error calling customer tool ${toolName}:`, error);
      return {
        error: {
          type: "internal_error",
          data: `Error calling tool ${toolName}: ${error.message}`
        }
      };
    }
  }

  /**
   * Get connection status summary
   */
  getConnectionStatus() {
    return {
      ...this.connectionState,
      totalTools: this.tools.length,
      storefrontTools: this.storefrontTools.length,
      customerTools: this.customerTools.length,
      isReady: this.connectionState.storefront === 'ready' || this.connectionState.customer === 'ready'
    };
  }

  /**
   * Check if client is ready to handle tool calls
   */
  isReady() {
    return this.connectionState.storefront === 'ready' || this.connectionState.customer === 'ready';
  }

  /**
   * Formats raw tool data into a consistent format.
   */
  _formatToolsData(toolsData) {
    return toolsData.map((tool) => {
      return {
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema || tool.input_schema,
      };
    });
  }

  /**
   * Cleanup resources
   */
  disconnect() {
    this.updateConnectionState('storefront', 'disconnected');
    this.updateConnectionState('customer', 'disconnected');
    this.tools = [];
    this.customerTools = [];
    this.storefrontTools = [];
    this.eventListeners = {
      'connection-state-change': [],
      'tools-updated': [],
      'error': []
    };
  }
}

export default EnhancedMCPClient; 