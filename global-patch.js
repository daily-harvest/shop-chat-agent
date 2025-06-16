// global-patch.js

// This file patches the global object to prevent Prisma from breaking in Cloudflare Workers

// Detect if we're running in a Cloudflare Workers environment
const isCloudflareWorker = () => {
  return typeof process === 'undefined' || 
         typeof self !== 'undefined' && typeof self.caches !== 'undefined' ||
         typeof globalThis !== 'undefined' && (
           typeof globalThis.env !== 'undefined' || 
           typeof globalThis.__REMIX_CONTEXT__ !== 'undefined'
         );
};

// Set up a mock PrismaClient if in Cloudflare Worker environment
if (isCloudflareWorker()) {
  console.log("Cloudflare Worker environment detected - setting up mock Prisma");
  
  // Mock for Prisma in browser/CF worker environment
  globalThis.process = globalThis.process || {
    env: {},
    version: '',
    release: { name: 'node' },
    browser: true,
    platform: 'browser',
    versions: { node: '18.0.0' },
  };
}

export { isCloudflareWorker };
