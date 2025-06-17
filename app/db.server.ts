import type { D1Database } from '@cloudflare/workers-types';
import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from '@prisma/adapter-d1';

declare global {
  var d1GlobalDb: D1Database | undefined;
}

// For development, we might want to use a cached instance
// For production, we'll always get the fresh instance from env
const getDb = (env?: { DB: D1Database }): D1Database | undefined => {
  if (process.env.NODE_ENV !== "production") {
    // In development, use cached instance if available
    if (!global.d1GlobalDb && env?.DB) {
      global.d1GlobalDb = env.DB;
    }
    return global.d1GlobalDb;
  }
  
  // In production, always use the environment binding
  return env?.DB;
};

// Initialize Prisma with D1 adapter
// The database is made available through global variables set in load-context.ts
const getDbInstance = () => {
  // Try to get from global variables set by load-context.ts
  if (typeof global !== 'undefined' && global.d1GlobalDb) {
    console.log('Using global.d1GlobalDb for Prisma D1 connection');
    return global.d1GlobalDb;
  }
  
  // Try globalThis (available in both Node.js and Workers)
  // eslint-disable-next-line no-undef
  if (typeof globalThis !== 'undefined' && (globalThis as any).shopifyDb) {
    // eslint-disable-next-line no-undef
    console.log('Using globalThis.shopifyDb for Prisma D1 connection');
     // eslint-disable-next-line no-undef
    return (globalThis as any).shopifyDb;
  }
  
  // Fallback to environment variable (for Workers)
  if (process.env.DB) {
    console.log('Using process.env.DB for Prisma D1 connection');
    return process.env.DB;
  }
  
  // If running in development/local environment, throw a descriptive error
  console.error('No D1 database instance found. Available sources:', {
    globalD1: typeof global !== 'undefined' ? !!global.d1GlobalDb : 'global undefined',
    // eslint-disable-next-line no-undef
    globalThisShopify: typeof globalThis !== 'undefined' ? !!globalThis.shopifyDb : 'globalThis undefined',
    processEnvDB: !!process.env.DB,
    nodeEnv: process.env.NODE_ENV
  });
  
  return null;
};

// Global Prisma instance cache
let prismaInstance: PrismaClient | null = null;

/**
 * Get or create Prisma client instance
 * @param env - Environment object containing D1 database binding
 * @returns Prisma client instance
 */
export const getPrismaClient = (env?: { DB: D1Database }): PrismaClient => {
  // In Cloudflare Workers, we need to get the DB from env on each request
  if (env?.DB) {
    // Create a new instance with the current env.DB
    return new PrismaClient({
      adapter: new PrismaD1(env.DB)
    });
  }
  
  // Fallback for development or when DB is available globally
  if (!prismaInstance) {
    const dbInstance = getDbInstance();
    if (!dbInstance) {
      throw new Error('No database instance available. Make sure D1 binding is configured.');
    }
    prismaInstance = new PrismaClient({
      adapter: new PrismaD1(dbInstance)
    });
  }
  
  return prismaInstance;
};

export default getDb;

// Export legacy Prisma instance for backward compatibility
export const prisma = getPrismaClient();

// Helper functions for common database operations
export const executeQuery = async (db: D1Database, query: string, params: any[] = []) => {
  const statement = db.prepare(query);
  if (params.length > 0) {
    statement.bind(...params);
  }
  return await statement.run();
};

export const getAllRows = async (db: D1Database, query: string, params: any[] = []) => {
  const statement = db.prepare(query);
  if (params.length > 0) {
    statement.bind(...params);
  }
  return await statement.all();
};

export const getFirstRow = async (db: D1Database, query: string, params: any[] = []) => {
  const statement = db.prepare(query);
  if (params.length > 0) {
    statement.bind(...params);
  }
  return await statement.first();
};

/**
 * Store a code verifier for PKCE authentication
 * @param {string} state - The state parameter used in OAuth flow
 * @param {string} verifier - The code verifier to store
 * @param {object} env - Environment object containing D1 database binding
 * @returns {Promise<Object>} - The saved code verifier object
 */
export async function storeCodeVerifier(state: any, verifier: any, env?: { DB: D1Database }) {
  // Calculate expiration date (10 minutes from now)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  try {
    const prisma = getPrismaClient(env);
    return await prisma.codeVerifier.create({
      data: {
        id: `cv_${Date.now()}`,
        state,
        verifier,
        expiresAt
      }
    });
  } catch (error) {
    console.error('Error storing code verifier:', error);
    throw error;
  }
}

/**
 * Get a code verifier by state parameter
 * @param {string} state - The state parameter used in OAuth flow
 * @param {object} env - Environment object containing D1 database binding
 * @returns {Promise<Object|null>} - The code verifier object or null if not found
 */
export async function getCodeVerifier(state: any, env?: { DB: D1Database }) {
  try {
    const prisma = getPrismaClient(env);
    const verifier = await prisma.codeVerifier.findFirst({
      where: {
        state,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (verifier) {
      // Delete it after retrieval to prevent reuse
      await prisma.codeVerifier.delete({
        where: {
          id: verifier.id
        }
      });
    }

    return verifier;
  } catch (error) {
    console.error('Error retrieving code verifier:', error);
    return null;
  }
}

/**
 * Store a customer access token in the database
 * @param {string} conversationId - The conversation ID to associate with the token
 * @param {string} accessToken - The access token to store
 * @param {Date} expiresAt - When the token expires
 * @param {object} env - Environment object containing D1 database binding
 * @returns {Promise<Object>} - The saved customer token
 */
export async function storeCustomerToken(conversationId: any, accessToken: any, expiresAt: any, env?: { DB: D1Database }) {
  try {
    const prisma = getPrismaClient(env);
    // Check if a token already exists for this conversation
    const existingToken = await prisma.customerToken.findFirst({
      where: { conversationId }
    });

    if (existingToken) {
      // Update existing token
      return await prisma.customerToken.update({
        where: { id: existingToken.id },
        data: {
          accessToken,
          expiresAt,
          updatedAt: new Date()
        }
      });
    }

    // Create a new token record
    return await prisma.customerToken.create({
      data: {
        id: `ct_${Date.now()}`,
        conversationId,
        accessToken,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error storing customer token:', error);
    throw error;
  }
}

/**
 * Get a customer access token by conversation ID
 * @param {string} conversationId - The conversation ID
 * @param {object} env - Environment object containing D1 database binding
 * @returns {Promise<Object|null>} - The customer token or null if not found/expired
 */
export async function getCustomerToken(conversationId: any, env?: { DB: D1Database }) {
  try {
    const prisma = getPrismaClient(env);
    const token = await prisma.customerToken.findFirst({
      where: {
        conversationId,
        expiresAt: {
          gt: new Date() // Only return non-expired tokens
        }
      }
    });

    return token;
  } catch (error) {
    console.error('Error retrieving customer token:', error);
    return null;
  }
}

/**
 * Create or update a conversation in the database
 * @param {string} conversationId - The conversation ID
 * @param {object} env - Environment object containing D1 database binding
 * @returns {Promise<Object>} - The created or updated conversation
 */
export async function createOrUpdateConversation(conversationId: any, env?: { DB: D1Database }) {
  try {
    const prisma = getPrismaClient(env);
    const existingConversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (existingConversation) {
      return await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          updatedAt: new Date()
        }
      });
    }

    return await prisma.conversation.create({
      data: {
        id: conversationId
      }
    });
  } catch (error) {
    console.error('Error creating/updating conversation:', error);
    throw error;
  }
}

/**
 * Save a message to the database
 * @param {string} conversationId - The conversation ID
 * @param {string} role - The message role (user or assistant)
 * @param {string} content - The message content
 * @param {object} env - Environment object containing D1 database binding
 * @returns {Promise<Object>} - The saved message
 */
export async function saveMessage(conversationId: any, role: any, content: any, env?: { DB: D1Database }) {
  try {
    // Ensure the conversation exists
    await createOrUpdateConversation(conversationId, env);

    // Create the message
    const prisma = getPrismaClient(env);
    return await prisma.message.create({
      data: {
        conversationId,
        role,
        content
      }
    });
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
}

/**
 * Get conversation history
 * @param {string} conversationId - The conversation ID
 * @param {object} env - Environment object containing D1 database binding
 * @returns {Promise<Array>} - Array of messages in the conversation
 */
export async function getConversationHistory(conversationId: any, env?: { DB: D1Database }) {
  try {
    const prisma = getPrismaClient(env);
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    });

    return messages;
  } catch (error) {
    console.error('Error retrieving conversation history:', error);
    return [];
  }
}

/**
 * Store customer account URL for a conversation
 * @param {string} conversationId - The conversation ID
 * @param {string} url - The customer account URL
 * @param {object} env - Environment object containing D1 database binding
 * @returns {Promise<Object>} - The saved URL object
 */
export async function storeCustomerAccountUrl(conversationId: any, url: any, env?: { DB: D1Database }) {
  try {
    const prisma = getPrismaClient(env);
    return await prisma.customerAccountUrl.upsert({
      where: { conversationId },
      update: {
        url,
        updatedAt: new Date()
      },
      create: {
        conversationId,
        url,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error storing customer account URL:', error);
    throw error;
  }
}

/**
 * Get customer account URL for a conversation
 * @param {string} conversationId - The conversation ID
 * @param {object} env - Environment object containing D1 database binding
 * @returns {Promise<string|null>} - The customer account URL or null if not found
 */
export async function getCustomerAccountUrl(conversationId: any, env?: { DB: D1Database }) {
  try {
    const prisma = getPrismaClient(env);
    const record = await prisma.customerAccountUrl.findUnique({
      where: { conversationId }
    });

    return record?.url || null;
  } catch (error) {
    console.error('Error retrieving customer account URL:', error);
    return null;
  }
}
