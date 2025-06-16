import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import type { D1Database } from '@cloudflare/workers-types';

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

interface CloudflareEnv {
  DB?: D1Database;
  [key: string]: any;
}

interface CloudflareContext {
  env?: CloudflareEnv;
  context?: any;
  waitUntil?: (promise: Promise<any>) => void;
}

/**
 * Create a Prisma client that works in both Node.js and Cloudflare Workers environments
 */
export function createPrismaClient(): PrismaClient {
  // For Node.js development environment
  if (process.env.NODE_ENV !== 'production') {
    if (!global.prismaGlobal) {
      global.prismaGlobal = new PrismaClient();
    }
    return global.prismaGlobal;
  }

  // For Cloudflare Workers environment in production
  try {
    const ctx = getCloudflareContext();
    
    if (ctx?.env?.DB) {
      // Use the D1 adapter with the D1 database binding
      const d1Adapter = new PrismaD1(ctx.env.DB);
      const client = new PrismaClient({
        // @ts-ignore: The adapter property exists but isn't in the TypeScript types
        adapter: d1Adapter
      });
      return client;
    } else {
      console.error('No D1 database binding found in environment');
      
      // Fallback to regular Prisma client without adapter
      // This will likely fail but better than an immediate crash
      return new PrismaClient();
    }
  } catch (error) {
    console.error('Error creating Prisma client with D1 adapter:', error);
    throw error;
  }
}

/**
 * Get the Cloudflare environment and context objects
 * This is needed to access the current request's execution context
 */
function getCloudflareContext(): CloudflareContext {
  try {
    // Try to get context from various global objects that might exist
    
    // Option 1: Check for Cloudflare Workers env in standard location
    if (typeof (globalThis as any).env !== 'undefined' && (globalThis as any).env?.DB) {
      return { env: (globalThis as any).env };
    }
    
    // Option 2: Check for context object in standard location
    if (typeof (globalThis as any).context !== 'undefined') {
      return (globalThis as any).context;
    }
    
    // Option 3: Check for Remix-specific context
    if (typeof (globalThis as any).__REMIX_CONTEXT__ !== 'undefined') {
      const remixContext = (globalThis as any).__REMIX_CONTEXT__;
      if (remixContext?.env?.DB) {
        return { env: remixContext.env };
      }
    }
    
    // If we can't find the context, return an empty object
    console.warn('Could not find Cloudflare context with DB binding');
    return {};
  } catch (e) {
    console.error('Error accessing Cloudflare context:', e);
    return {};
  }
}
