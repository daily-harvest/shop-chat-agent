import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import McpChatInterface from "../../components/chat/McpChatInterface";

interface MCPTool {
  name: string;
  description: string;
  input_schema?: any;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // For demo purposes, let's get shop info from URL or headers
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop") || "demo-shop.myshopify.com";
  
  return json({
    shopDomain: shopDomain,
    storefrontMcpUrl: `${shopDomain}/api/mcp`,
    customerMcpUrl: `${shopDomain.replace(/(\.myshopify\.com)$/, '.account$1').replace('://', '://account.')}/customer/api/mcp`
  });
};

export default function Index() {
  const { shopDomain, storefrontMcpUrl, customerMcpUrl } = useLoaderData<typeof loader>();
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [conversationId] = useState(() => Date.now().toString());

  const handleToolsReady = (tools: MCPTool[]) => {
    setMcpTools(tools);
    console.log("MCP Tools ready:", tools);
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8", padding: "20px" }}>
      <h1>Shop Chat Agent - Enhanced with use-mcp</h1>
      
      <div style={{ 
        margin: "20px 0", 
        padding: "20px", 
        backgroundColor: "#f8f9fa", 
        borderRadius: "8px" 
      }}>
        <h2>MCP Connection Status</h2>
        <p><strong>Shop Domain:</strong> {shopDomain}</p>
        <p><strong>Storefront MCP URL:</strong> {storefrontMcpUrl}</p>
        <p><strong>Customer MCP URL:</strong> {customerMcpUrl}</p>
      </div>
      
      <div style={{ 
        margin: "20px 0", 
        padding: "20px", 
        border: "1px solid #dee2e6", 
        borderRadius: "8px" 
      }}>
        <h2>MCP Chat Interface</h2>
        <McpChatInterface
          storefrontMcpUrl={storefrontMcpUrl}
          customerMcpUrl={customerMcpUrl}
          conversationId={conversationId}
          onToolsReady={handleToolsReady}
        />
      </div>
      
      {mcpTools.length > 0 && (
        <div style={{ 
          margin: "20px 0", 
          padding: "20px", 
          backgroundColor: "#d4edda", 
          borderRadius: "8px" 
        }}>
          <h2>Available MCP Tools ({mcpTools.length})</h2>
          <ul>
            {mcpTools.map((tool, index) => (
              <li key={index} style={{ marginBottom: "10px" }}>
                <strong>{tool.name}</strong>: {tool.description}
                {tool.input_schema && (
                  <details style={{ marginTop: "5px" }}>
                    <summary>Input Schema</summary>
                    <pre style={{ 
                      fontSize: "12px", 
                      background: "#f5f5f5", 
                      padding: "10px",
                      borderRadius: "4px",
                      overflow: "auto"
                    }}>
                      {JSON.stringify(tool.input_schema, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <div style={{ 
        marginTop: "30px", 
        padding: "20px", 
        backgroundColor: "#d1ecf1", 
        borderRadius: "8px" 
      }}>
        <h2>🎉 Integration Complete!</h2>
        <p>Your Remix app now includes:</p>
        <ul>
          <li>✅ <strong>use-mcp library</strong> installed and working</li>
          <li>✅ <strong>Enhanced MCP Client</strong> with retry logic and better error handling</li>
          <li>✅ <strong>Client-side MCP connection</strong> using React hooks</li>
          <li>✅ <strong>Real-time connection status</strong> and tool discovery</li>
          <li>✅ <strong>Backward compatibility</strong> with your existing server-side approach</li>
        </ul>
        
        <h3>Next Steps:</h3>
        <ul>
          <li>📱 Test the MCP connections in your browser console</li>
          <li>🔧 Customize the UI and add your chat interface</li>
          <li>🔄 Gradually migrate from the old MCP client to the new enhanced version</li>
          <li>🚀 Deploy and enjoy improved reliability and features!</li>
        </ul>
        
        <h3>Key Benefits:</h3>
        <ul>
          <li><strong>Better Error Handling:</strong> Automatic retries and connection management</li>
          <li><strong>OAuth Support:</strong> Built-in authentication flows</li>
          <li><strong>Future-Proof:</strong> Supports both SSE and Streamable HTTP transport</li>
          <li><strong>Developer Experience:</strong> Real-time debugging and monitoring</li>
        </ul>
      </div>
    </div>
  );
}