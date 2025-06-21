# MCP Integration with use-mcp Library

## 🎉 Integration Complete!

Your Remix app has been successfully enhanced with the `use-mcp` library! This guide explains what was added and how to use it.

## What Was Added

### 1. use-mcp Library Installation
```bash
npm install use-mcp
```

### 2. New Components & Files

- **`app/components/chat/McpChatInterface.jsx`** - React component using the `use-mcp` library
- **`app/mcp-client-enhanced.js`** - Enhanced server-side MCP client with better error handling
- **Updated `app/routes/chat.jsx`** - Now uses the enhanced MCP client
- **Updated `app/routes/_index/route.tsx`** - Demonstrates the integration

## How It Works

### Client-Side Integration (use-mcp)

The `McpChatInterface` component connects to your MCP servers using the `use-mcp` library:

```jsx
import { useMcp } from 'use-mcp/react';

const storefrontMcp = useMcp({
  url: storefrontMcpUrl,
  debug: true
});

const customerMcp = useMcp({
  url: customerMcpUrl,
  debug: true
});
```

**Benefits:**
- ✅ **Automatic Connection Management** - Handles reconnections and failures
- ✅ **Real-time Status Updates** - Shows connection state changes
- ✅ **Built-in Error Handling** - Graceful error recovery
- ✅ **OAuth Support Ready** - Future-proof for authentication flows

### Server-Side Enhancement

The `EnhancedMCPClient` provides better server-side MCP handling:

```javascript
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
```

**Features:**
- 🔄 **Automatic Retries** - Configurable retry logic
- ⏱️ **Timeout Management** - Prevents hanging requests
- 📊 **Connection Events** - Real-time status monitoring
- 🛡️ **Better Error Handling** - Detailed error reporting

## Testing the Integration

### 1. Start Your Development Server
```bash
npm run dev
```

### 2. Visit Your App
Navigate to your app's main route to see the MCP integration in action.

### 3. Check Browser Console
The integration includes debug logging. Open your browser's developer console to see:
- MCP connection attempts
- Tool discovery
- Real-time status updates

### 4. Expected Output
You should see:
- Connection status for both storefront and customer MCP servers
- List of available tools from connected servers
- Real-time updates as connections change

## Next Steps

### Immediate Actions

1. **Test Tool Calling** - Try calling tools through the enhanced client
2. **Customize UI** - Modify the `McpChatInterface` component to match your design
3. **Add Error Handling** - Implement user-friendly error messages

### Migration Strategy

1. **Keep Both Clients** - The old and enhanced clients work together
2. **Gradual Migration** - Slowly move features to the enhanced client
3. **Monitor Performance** - Compare reliability between old vs new approach

### Advanced Configuration

#### Custom MCP Connection Options
```javascript
const mcpOptions = {
  debug: process.env.NODE_ENV === 'development',
  retryAttempts: 5,
  retryDelay: 2000,
  timeout: 45000
};
```

#### Event Listeners
```javascript
mcpClient.addEventListener('connection-state-change', (event) => {
  console.log(`${event.server} changed from ${event.previousState.storefront} to ${event.state}`);
});

mcpClient.addEventListener('tools-updated', (event) => {
  console.log(`New tools available from ${event.server}:`, event.tools);
});
```

## Troubleshooting

### Common Issues

1. **Module Not Found: 'use-mcp/react'**
   - Ensure `use-mcp` is installed: `npm install use-mcp`
   - Restart your development server

2. **MCP Servers Not Connecting**
   - Check your MCP endpoint URLs
   - Verify CORS settings
   - Enable debug mode to see detailed logs

3. **Tools Not Loading**
   - Check network requests in browser dev tools
   - Verify MCP server responses
   - Enable debug logging

### Debug Mode

Enable debug mode for detailed logging:

```javascript
// Client-side
const mcpClient = useMcp({
  url: mcpUrl,
  debug: true
});

// Server-side
const mcpClient = new EnhancedMCPClient(url, id, shopId, endpoint, {
  debug: true
});
```

## Benefits Summary

| Feature | Old MCP Client | Enhanced Client | use-mcp Library |
|---------|---------------|-----------------|-----------------|
| Error Handling | Basic | Advanced | Excellent |
| Retries | Manual | Automatic | Automatic |
| Real-time Updates | No | Yes | Yes |
| OAuth Support | Custom | Enhanced | Built-in |
| Connection Management | Manual | Event-driven | Automatic |
| Debug Support | Limited | Comprehensive | Built-in |

## File Structure

```
app/
├── components/
│   └── chat/
│       └── McpChatInterface.jsx      # New React component
├── routes/
│   ├── chat.jsx                      # Updated with enhanced client
│   └── _index/
│       └── route.tsx                 # Demo integration
├── mcp-client.js                     # Original client (kept for compatibility)
└── mcp-client-enhanced.js            # New enhanced client
```

## Deployment Considerations

### Environment Variables
Consider adding these environment variables:
```bash
MCP_DEBUG=false
MCP_RETRY_ATTEMPTS=3
MCP_TIMEOUT=30000
```

### Production Optimizations
- Disable debug mode in production
- Adjust retry/timeout settings for your network conditions
- Monitor connection metrics

## Support & Resources

### Documentation
- [use-mcp GitHub Repository](https://github.com/cloudflare/use-mcp)
- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Cloudflare Workers MCP Guide](https://developers.cloudflare.com/workers/)

### Getting Help
- Check browser console for debug information
- Review network requests in developer tools
- Test with different MCP server configurations

---

🎉 **Congratulations!** Your Remix app now has a robust, production-ready MCP integration that's future-proof and developer-friendly! 