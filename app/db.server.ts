import type { D1Database } from '@cloudflare/workers-types';
import { dbClient } from './db-client.server';

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

export default getDb;

// Use our unified database client that works in both Node and Cloudflare environments
const prisma = dbClient;


/**
 * Store a code verifier for PKCE authentication
 * @param {string} state - The state parameter used in OAuth flow
 * @param {string} verifier - The code verifier to store
 * @returns {Promise<Object>} - The saved code verifier object
 */
export async function storeCodeVerifier(state: any, verifier: any) {
  // Calculate expiration date (10 minutes from now)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  try {
    return await prisma.codeVerifier.create?.({
      data: {
        id: `cv_${Date.now()}`,
        state,
        verifier,
        expiresAt
      }
    }) || await prisma.codeVerifier.insert?.({
      id: `cv_${Date.now()}`,
      state,
      verifier,
      expiresAt
    });
  } catch (error) {
    console.error('Error storing code verifier:', error);
    throw error;
  }
}

/**
 * Get a code verifier by state parameter
 * @param {string} state - The state parameter used in OAuth flow
 * @returns {Promise<Object|null>} - The code verifier object or null if not found
 */
export async function getCodeVerifier(state: any) {
  try {
    const verifier = await prisma.codeVerifier.findFirst?.({
      where: {
        state,
        expiresAt: {
          gt: new Date()
        }
      }
    }) || await prisma.codeVerifier.findByState?.(state, new Date());

    if (verifier) {
      // Delete it after retrieval to prevent reuse
      await prisma.codeVerifier.delete?.({
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
 * @returns {Promise<Object>} - The saved customer token
 */
export async function storeCustomerToken(conversationId: any, accessToken: any, expiresAt: any) {
  try {
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
 * @returns {Promise<Object|null>} - The customer token or null if not found/expired
 */
export async function getCustomerToken(conversationId: any) {
  try {
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
 * @returns {Promise<Object>} - The created or updated conversation
 */
export async function createOrUpdateConversation(conversationId: any) {
  try {
    // Use our unified DB client which works in both Node.js and Cloudflare
    const existingConversation = await prisma.conversation.findUnique?.({
      where: { id: conversationId }
    }) || await prisma.conversation.findById?.(conversationId);

    if (existingConversation) {
      return await prisma.conversation.update?.({
        where: { id: conversationId },
        data: {
          updatedAt: new Date()
        }
      }) || await prisma.conversation.updateById?.(conversationId, {
        updatedAt: new Date()
      });
    }

    return await prisma.conversation.create?.({
      data: {
        id: conversationId
      }
    }) || await prisma.conversation.insert?.({
      id: conversationId
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
 * @returns {Promise<Object>} - The saved message
 */
export async function saveMessage(conversationId: any, role: any, content: any) {
  try {
    // Ensure the conversation exists
    await createOrUpdateConversation(conversationId);

    // Create the message
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
 * @returns {Promise<Array>} - Array of messages in the conversation
 */
export async function getConversationHistory(conversationId: any) {
  try {
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
 * @returns {Promise<Object>} - The saved URL object
 */
export async function storeCustomerAccountUrl(conversationId: any, url: any) {
  try {
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
 * @returns {Promise<string|null>} - The customer account URL or null if not found
 */
export async function getCustomerAccountUrl(conversationId: any) {
  try {
    const record = await prisma.customerAccountUrl.findUnique({
      where: { conversationId }
    });

    return record?.url || null;
  } catch (error) {
    console.error('Error retrieving customer account URL:', error);
    return null;
  }
}
