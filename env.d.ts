/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

// Global type declarations for database access
declare global {
  var d1GlobalDb: D1Database | undefined;
  var shopifyDb: D1Database | undefined;
  
  namespace globalThis {
    var shopifyDb: D1Database | undefined;
  }
}
