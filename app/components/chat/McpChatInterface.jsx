import { useState, useEffect, useCallback } from 'react';
import { useMcp } from 'use-mcp/react';

/**
 * Chat interface component that uses the use-mcp library
 * for connecting to MCP servers
 */
export default function McpChatInterface({ 
  storefrontMcpUrl, 
  customerMcpUrl,
  conversationId,
  onToolsReady 
}) {
  const [mcpTools, setMcpTools] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // Connect to storefront MCP server
  const storefrontMcp = useMcp({
    url: storefrontMcpUrl,
    debug: true
  });

  // Connect to customer MCP server (if available)
  const customerMcp = useMcp({
    url: customerMcpUrl,
    debug: true
  });

  // Combine tools from both MCP servers
  useEffect(() => {
    const allTools = [
      ...(storefrontMcp.tools || []),
      ...(customerMcp.tools || [])
    ];
    
    setMcpTools(allTools);
    
    // Notify parent component about available tools
    if (onToolsReady) {
      onToolsReady(allTools);
    }
  }, [storefrontMcp.tools, customerMcp.tools, onToolsReady]);

  // Update connection status
  useEffect(() => {
    const storefrontReady = storefrontMcp.state === 'ready';
    const customerReady = !customerMcpUrl || customerMcp.state === 'ready';
    const storefrontConnecting = storefrontMcp.state === 'connecting';
    const customerConnecting = customerMcpUrl && customerMcp.state === 'connecting';
    
    if (storefrontReady && customerReady) {
      setConnectionStatus('ready');
    } else if (storefrontConnecting || customerConnecting) {
      setConnectionStatus('connecting');
    } else if (storefrontMcp.state === 'failed' || customerMcp.state === 'failed') {
      setConnectionStatus('failed');
    } else {
      setConnectionStatus('disconnected');
    }
  }, [storefrontMcp.state, customerMcp.state, customerMcpUrl]);

  // Tool calling function that routes to the appropriate MCP server
  const callTool = useCallback(async (toolName, toolArgs) => {
    try {
      // Check if tool exists in storefront MCP
      const storefrontTool = storefrontMcp.tools?.find(tool => tool.name === toolName);
      if (storefrontTool) {
        return await storefrontMcp.callTool(toolName, toolArgs);
      }

      // Check if tool exists in customer MCP
      const customerTool = customerMcp.tools?.find(tool => tool.name === toolName);
      if (customerTool) {
        return await customerMcp.callTool(toolName, toolArgs);
      }

      throw new Error(`Tool ${toolName} not found in any MCP server`);
    } catch (error) {
      console.error(`Error calling tool ${toolName}:`, error);
      
      // Return error in the same format as the old MCP client
      return {
        error: {
          type: "tool_call_error",
          data: error.message
        }
      };
    }
  }, [storefrontMcp, customerMcp]);

  // Connection status display
  const getConnectionStatusMessage = () => {
    switch (connectionStatus) {
      case 'connecting':
        return 'Connecting to MCP servers...';
      case 'ready':
        return `Connected to MCP servers (${mcpTools.length} tools available)`;
      case 'failed':
        return 'Failed to connect to MCP servers';
      default:
        return 'Not connected to MCP servers';
    }
  };

  // Debug information
  const getDebugInfo = () => {
    if (process.env.NODE_ENV !== 'development') return null;
    
    return (
      <div className="mcp-debug-info" style={{ 
        background: '#f5f5f5', 
        padding: '10px', 
        margin: '10px 0', 
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        <h4>MCP Debug Information</h4>
        <p><strong>Storefront MCP:</strong> {storefrontMcp.state} ({storefrontMcp.tools?.length || 0} tools)</p>
        {customerMcpUrl && (
          <p><strong>Customer MCP:</strong> {customerMcp.state} ({customerMcp.tools?.length || 0} tools)</p>
        )}
        <p><strong>Total Tools:</strong> {mcpTools.length}</p>
        {mcpTools.length > 0 && (
          <details>
            <summary>Available Tools</summary>
            <ul>
              {mcpTools.map((tool, index) => (
                <li key={index}>
                  <strong>{tool.name}</strong>: {tool.description}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  };

  // Expose the callTool function and other data via ref or props
  useEffect(() => {
    // Store reference to callTool function globally so server-side code can access it
    if (typeof window !== 'undefined') {
      window.mcpCallTool = callTool;
      window.mcpTools = mcpTools;
      window.mcpConnectionStatus = connectionStatus;
    }
  }, [callTool, mcpTools, connectionStatus]);

  return (
    <div className="mcp-chat-interface">
      <div className="mcp-status" style={{
        padding: '10px',
        backgroundColor: connectionStatus === 'ready' ? '#d4edda' : 
                        connectionStatus === 'connecting' ? '#fff3cd' : 
                        connectionStatus === 'failed' ? '#f8d7da' : '#e2e3e5',
        color: connectionStatus === 'ready' ? '#155724' : 
               connectionStatus === 'connecting' ? '#856404' : 
               connectionStatus === 'failed' ? '#721c24' : '#6c757d',
        borderRadius: '4px',
        marginBottom: '10px'
      }}>
        {getConnectionStatusMessage()}
      </div>
      
      {getDebugInfo()}
    </div>
  );
} 