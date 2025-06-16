/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />
/// <reference types="@cloudflare/workers-types" />

// Extend the global environment for Cloudflare Workers runtime
declare global {
  // For Cloudflare Workers environment
  var env: {
    DB: D1Database;
    [key: string]: any;
  };
  var context: {
    waitUntil: (promise: Promise<any>) => void;
    env?: Record<string, any>;
    passThroughOnException: () => void;
  };
  
  // For Remix-specific environment
  var __REMIX_CONTEXT__: {
    env: {
      DB: D1Database;
      [key: string]: any;
    };
    ctx?: any;
    context?: any;
  };
}
