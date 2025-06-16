import type { D1Database } from '@cloudflare/workers-types';
import * as d1PrismaWrapper from './db-wrapper';

// Type for our database client - could be Prisma in Node.js or D1Wrapper in Cloudflare
interface DbClient {
  conversation: any;
  message: any;
  codeVerifier: any;
  customerToken: any;
  customerAccountUrl: any;
}

// Define PrismaClient type but don't import it directly
// This prevents Cloudflare Workers from trying to load it at build time
type PrismaClient = any;

declare global {
  var prismaGlobal: PrismaClient | undefined;
  var d1GlobalDb: D1Database | undefined;
}

// Detect environment: Node.js or Cloudflare Workers
const isCloudflareWorker = () => {
  return typeof process === 'undefined' || 
         typeof (globalThis as any).env !== 'undefined' ||
         typeof (globalThis as any).__REMIX_CONTEXT__ !== 'undefined' || 
         typeof (globalThis as any).caches !== 'undefined';
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
  try {
    const worker = isCloudflareWorker();
    console.log(`Running in ${worker ? 'Cloudflare Workers' : 'Node.js'} environment`);
    
    if (worker) {
      // In Cloudflare Workers environment
      console.log("Using D1 database wrapper for Cloudflare Workers environment");
      
      // Get D1 database instance
      const db = getD1Instance();
      
      if (!db) {
        console.error("No D1 database binding found in Cloudflare environment");
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
      // In Node.js environment - dynamically import PrismaClient only in Node environment
      console.log("Using Prisma client for Node.js environment");
      
      // Dynamic import of PrismaClient
      const { PrismaClient } = require('@prisma/client');
      
      // We can safely access process.env here since we're in Node.js
      if (process.env.NODE_ENV !== "production") {
        if (!global.prismaGlobal) {
          global.prismaGlobal = new PrismaClient();
        }
        return global.prismaGlobal;
      }
      
      // Create new instance in production
      return new PrismaClient();
    }
  } catch (error) {
    console.error("Error creating database client:", error);
    
    // If we're in a CF worker, return the wrapper as fallback
    if (isCloudflareWorker()) {
      return {
        conversation: d1PrismaWrapper.conversation,
        message: d1PrismaWrapper.message,
        codeVerifier: d1PrismaWrapper.codeVerifier,
        customerToken: d1PrismaWrapper.customerToken,
        customerAccountUrl: d1PrismaWrapper.customerAccountUrl
      };
    }
    
    throw error;
  }
}

// Export singleton instance
export const dbClient = createDbClient();

// Export specific models for convenience
export const { conversation, message, codeVerifier, customerToken, customerAccountUrl } = dbClient;
