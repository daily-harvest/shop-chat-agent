import type { D1Database } from '@cloudflare/workers-types';
import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from '@prisma/adapter-d1';
import * as d1PrismaWrapper from './db-wrapper';

// Type for our database client - could be Prisma in Node.js or D1Wrapper in Cloudflare
interface DbClient {
  conversation: any;
  message: any;
  codeVerifier: any;
  customerToken: any;
  customerAccountUrl: any;
}

declare global {
  var prismaGlobal: PrismaClient | undefined;
  var d1GlobalDb: D1Database | undefined;
}

// Detect environment: Node.js or Cloudflare Workers
const isCloudflareWorker = () => {
  return typeof (globalThis as any).process === 'undefined' || 
         typeof (globalThis as any).env !== 'undefined' ||
         typeof (globalThis as any).__REMIX_CONTEXT__ !== 'undefined';
};

// Get Cloudflare D1 database instance
const getD1Instance = (): D1Database | undefined => {
  // Try to get database from various global objects that might exist in Cloudflare env
  
  // Option 1: Direct env binding
  if (typeof (globalThis as any).env !== 'undefined' && (globalThis as any).env?.DB) {
    return (globalThis as any).env.DB;
  }
  
  // Option 2: Context object
  if (typeof (globalThis as any).context?.env?.DB !== 'undefined') {
    return (globalThis as any).context.env.DB;
  }
  
  // Option 3: Remix-specific context
  if (typeof (globalThis as any).__REMIX_CONTEXT__ !== 'undefined') {
    const remixContext = (globalThis as any).__REMIX_CONTEXT__;
    if (remixContext?.env?.DB) {
      return remixContext.env.DB;
    }
  }
  
  // If development mode, use cached database
  if (process.env.NODE_ENV !== "production" && global.d1GlobalDb) {
    return global.d1GlobalDb;
  }
  
  // No database binding found
  return undefined;
};

// Create a client based on the environment
export function createDbClient(): DbClient {
  if (isCloudflareWorker()) {
    // In Cloudflare Workers environment
    console.log("Using D1 database wrapper for Cloudflare Workers environment");
    
    // Get D1 database instance
    const db = getD1Instance();
    
    if (!db) {
      throw new Error("No D1 database binding found in Cloudflare environment");
    }
    
    // Initialize D1 database
    d1PrismaWrapper.initDB(db);
    
    // Return the wrapper with Prisma-like interface
    return {
      conversation: d1PrismaWrapper.conversation,
      message: d1PrismaWrapper.message,
      codeVerifier: d1PrismaWrapper.codeVerifier,
      customerToken: d1PrismaWrapper.customerToken,
      customerAccountUrl: d1PrismaWrapper.customerAccountUrl
    };
  } else {
    // In Node.js environment
    console.log("Using Prisma client for Node.js environment");
    
    // Use cached instance in development
    if (process.env.NODE_ENV !== "production") {
      if (!global.prismaGlobal) {
        global.prismaGlobal = new PrismaClient();
      }
      return global.prismaGlobal;
    }
    
    // Create new instance in production
    return new PrismaClient();
  }
}

// Export singleton instance
export const dbClient = createDbClient();

// Export specific models for convenience
export const { conversation, message, codeVerifier, customerToken, customerAccountUrl } = dbClient;
