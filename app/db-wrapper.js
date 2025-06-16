/**
 * Database wrapper for Cloudflare D1 that mimics the Prisma interface used in the app
 */

// Global D1 database instance
let dbInstance = null;
let isInitializing = false;
let isInitialized = false;

/**
 * Initialize the database for operations
 * @param {D1Database} db - The D1 database instance from the Cloudflare environment
 * @returns {Promise<boolean>} - Success or failure
 */
export async function initDB(db) {
  if (!db) {
    console.error("No DB instance provided to initDB");
    return false;
  }
  
  // Set database instance immediately to ensure it's available
  dbInstance = db;
  
  // Prevent multiple simultaneous initialization
  if (isInitializing) {
    console.log("Database already initializing, waiting...");
    return true;
  }
  
  if (isInitialized) {
    console.log("Database already initialized");
    return true;
  }
  
  try {
    isInitializing = true;
    const result = await setupSchema();
    isInitialized = true;
    console.log("Database schema setup completed successfully");
    return result;
  } catch (error) {
    console.error("Error during database initialization:", error);
    return false;
  } finally {
    isInitializing = false;
  }
}

// Initialize the DB instance
export function initializeDbForOperations(db) {
  return initDB(db);
}

// Setup schema function to create tables if they don't exist
async function setupSchema() {
  if (!dbInstance) {
    console.error("D1 database not initialized in setupSchema");
    return false;
  }
  
  console.log("Starting database schema setup...");

  try {
    // Create Session table (already handled by our session store)
    await dbInstance.exec(`CREATE TABLE IF NOT EXISTS shopify_sessions (
      id TEXT PRIMARY KEY, 
      shop TEXT NOT NULL, 
      state TEXT, 
      isOnline INTEGER, 
      scope TEXT, 
      accessToken TEXT, 
      expires INTEGER, 
      onlineAccessInfo TEXT
    )`);

    // Create CustomerToken table
    await dbInstance.exec(`CREATE TABLE IF NOT EXISTS CustomerToken (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      accessToken TEXT NOT NULL,
      refreshToken TEXT,
      expiresAt INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )`);

    // Create CodeVerifier table
    await dbInstance.exec(`CREATE TABLE IF NOT EXISTS CodeVerifier (
      id TEXT PRIMARY KEY,
      state TEXT UNIQUE NOT NULL,
      verifier TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      expiresAt INTEGER NOT NULL
    )`);

    // Create Conversation table
    await dbInstance.exec(`CREATE TABLE IF NOT EXISTS Conversation (
      id TEXT PRIMARY KEY,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )`);

    // Create Message table
    await dbInstance.exec(`CREATE TABLE IF NOT EXISTS Message (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (conversationId) REFERENCES Conversation(id) ON DELETE CASCADE
    )`);

    // Create CustomerAccountUrl table
    await dbInstance.exec(`CREATE TABLE IF NOT EXISTS CustomerAccountUrl (
      id TEXT PRIMARY KEY,
      conversationId TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )`);

    // Verify tables were created - check one table as a sample
    const tableCheck = await dbInstance.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='CustomerToken'").first();
    if (!tableCheck) {
      console.error("Failed to create CustomerToken table");
      return false;
    }
    
    console.log("Database schema setup successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize database schema:", error);
    return false;
  }
}

// DB wrapper object with all models
const d1PrismaWrapper = {
  codeVerifier: {
    // Create a new code verifier
    async create({ data }) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        await dbInstance.prepare(`
          INSERT INTO CodeVerifier (id, state, verifier, createdAt, expiresAt)
          VALUES (?, ?, ?, ?, ?)
        `).bind(
          data.id,
          data.state,
          data.verifier,
          data.expiresAt.getTime(),
          data.expiresAt.getTime()
        ).run();
        
        return data;
      } catch (error) {
        console.error("Error creating code verifier:", error);
        throw error;
      }
    },
    
    // Find a code verifier by state
    async findFirst({ where }) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        const now = new Date().getTime();
        const result = await dbInstance.prepare(`
          SELECT * FROM CodeVerifier 
          WHERE state = ? AND expiresAt > ?
        `).bind(where.state, now).first();
        
        if (!result) return null;
        
        return {
          ...result,
          expiresAt: new Date(result.expiresAt),
          createdAt: new Date(result.createdAt)
        };
      } catch (error) {
        console.error("Error finding code verifier:", error);
        return null;
      }
    },
    
    // Find by state (D1-wrapper style)
    async findByState(state, currentDate) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        const now = currentDate.getTime();
        const result = await dbInstance.prepare(`
          SELECT * FROM CodeVerifier 
          WHERE state = ? AND expiresAt > ?
        `).bind(state, now).first();
        
        if (!result) return null;
        
        return {
          ...result,
          expiresAt: new Date(result.expiresAt),
          createdAt: new Date(result.createdAt)
        };
      } catch (error) {
        console.error("Error finding code verifier by state:", error);
        return null;
      }
    },
    
    // Delete a code verifier
    async delete({ where }) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        await dbInstance.prepare(`
          DELETE FROM CodeVerifier WHERE id = ?
        `).bind(where.id).run();
        
        return { id: where.id };
      } catch (error) {
        console.error("Error deleting code verifier:", error);
        throw error;
      }
    }
  },
  
  customerToken: {
    // Find a customer token by conversationId
    async findFirst({ where }) {
      if (!dbInstance) {
        console.error("Database not initialized when retrieving customer token");
        throw new Error("Database not initialized");
      }
      
      try {
        const now = new Date().getTime();
        console.log(`Retrieving customer token for conversation: ${where.conversationId}`);
        const result = await dbInstance.prepare(`
          SELECT * FROM CustomerToken 
          WHERE conversationId = ? AND expiresAt > ?
        `).bind(where.conversationId, now).first();
        
        if (!result) return null;
        
        return {
          ...result,
          expiresAt: new Date(result.expiresAt),
          createdAt: new Date(result.createdAt),
          updatedAt: new Date(result.updatedAt)
        };
      } catch (error) {
        console.error("Error finding customer token:", error);
        return null;
      }
    },
    
    // Update an existing customer token
    async update({ where, data }) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        await dbInstance.prepare(`
          UPDATE CustomerToken 
          SET accessToken = ?, expiresAt = ?, updatedAt = ?
          WHERE id = ?
        `).bind(
          data.accessToken,
          data.expiresAt.getTime(),
          data.updatedAt.getTime(),
          where.id
        ).run();
        
        return {
          ...data,
          id: where.id
        };
      } catch (error) {
        console.error("Error updating customer token:", error);
        throw error;
      }
    },
    
    // Create a new customer token
    async create({ data }) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        await dbInstance.prepare(`
          INSERT INTO CustomerToken 
          (id, conversationId, accessToken, expiresAt, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          data.id,
          data.conversationId,
          data.accessToken,
          data.expiresAt.getTime(),
          data.createdAt.getTime(),
          data.updatedAt.getTime()
        ).run();
        
        return data;
      } catch (error) {
        console.error("Error creating customer token:", error);
        throw error;
      }
    }
  },
  
  conversation: {
    // Find a conversation by ID (Prisma-style)
    async findUnique({ where }) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        const result = await dbInstance.prepare(`
          SELECT * FROM Conversation WHERE id = ?
        `).bind(where.id).first();
        
        if (!result) return null;
        
        return {
          ...result,
          createdAt: new Date(result.createdAt),
          updatedAt: new Date(result.updatedAt)
        };
      } catch (error) {
        console.error("Error finding conversation:", error);
        return null;
      }
    },
    
    // Find by ID (D1-wrapper style)
    async findById(id) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        const result = await dbInstance.prepare(`
          SELECT * FROM Conversation WHERE id = ?
        `).bind(id).first();
        
        if (!result) return null;
        
        return {
          ...result,
          createdAt: new Date(result.createdAt),
          updatedAt: new Date(result.updatedAt)
        };
      } catch (error) {
        console.error("Error finding conversation by ID:", error);
        return null;
      }
    },
    
    // Update an existing conversation (Prisma-style)
    async update({ where, data }) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        const now = new Date().getTime();
        await dbInstance.prepare(`
          UPDATE Conversation 
          SET updatedAt = ?
          WHERE id = ?
        `).bind(now, where.id).run();
        
        return {
          id: where.id,
          ...data,
          updatedAt: new Date(now)
        };
      } catch (error) {
        console.error("Error updating conversation:", error);
        throw error;
      }
    },
    
    // Update by ID (D1-wrapper style)
    async updateById(id, data) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        const now = new Date().getTime();
        await dbInstance.prepare(`
          UPDATE Conversation 
          SET updatedAt = ?
          WHERE id = ?
        `).bind(now, id).run();
        
        return {
          id,
          ...data,
          updatedAt: new Date(now)
        };
      } catch (error) {
        console.error("Error updating conversation by ID:", error);
        throw error;
      }
    },
    
    // Create a new conversation (Prisma-style)
    async create({ data }) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        const now = new Date().getTime();
        await dbInstance.prepare(`
          INSERT INTO Conversation 
          (id, createdAt, updatedAt)
          VALUES (?, ?, ?)
        `).bind(data.id, now, now).run();
        
        return {
          ...data,
          createdAt: new Date(now),
          updatedAt: new Date(now)
        };
      } catch (error) {
        console.error("Error creating conversation:", error);
        throw error;
      }
    },
    
    // Insert (D1-wrapper style)
    async insert(data) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        const now = new Date().getTime();
        await dbInstance.prepare(`
          INSERT INTO Conversation 
          (id, createdAt, updatedAt)
          VALUES (?, ?, ?)
        `).bind(data.id, now, now).run();
        
        return {
          ...data,
          createdAt: new Date(now),
          updatedAt: new Date(now)
        };
      } catch (error) {
        console.error("Error inserting conversation:", error);
        throw error;
      }
    }
  },
  
  message: {
    // Create a new message
    async create({ data }) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        const id = `msg_${Date.now()}`;
        const now = new Date().getTime();
        await dbInstance.prepare(`
          INSERT INTO Message 
          (id, conversationId, role, content, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `).bind(id, data.conversationId, data.role, data.content, now).run();
        
        return {
          id,
          ...data,
          createdAt: new Date(now)
        };
      } catch (error) {
        console.error("Error creating message:", error);
        throw error;
      }
    },
    
    // Find messages by conversation ID
    async findMany({ where, orderBy }) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        const order = orderBy?.createdAt === 'desc' ? 'DESC' : 'ASC';
        const results = await dbInstance.prepare(`
          SELECT * FROM Message 
          WHERE conversationId = ?
          ORDER BY createdAt ${order}
        `).bind(where.conversationId).all();
        
        return results.results.map(result => ({
          ...result,
          createdAt: new Date(result.createdAt)
        }));
      } catch (error) {
        console.error("Error finding messages:", error);
        return [];
      }
    }
  },
  
  customerAccountUrl: {
    // Upsert a customer account URL
    async upsert({ where, update, create }) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        // Check if record exists
        const existing = await dbInstance.prepare(`
          SELECT * FROM CustomerAccountUrl WHERE conversationId = ?
        `).bind(where.conversationId).first();
        
        const now = new Date().getTime();
        
        if (existing) {
          // Update existing record
          await dbInstance.prepare(`
            UPDATE CustomerAccountUrl 
            SET url = ?, updatedAt = ?
            WHERE conversationId = ?
          `).bind(update.url, now, where.conversationId).run();
          
          return {
            id: existing.id,
            conversationId: where.conversationId,
            url: update.url,
            createdAt: new Date(existing.createdAt),
            updatedAt: new Date(now)
          };
        } else {
          // Create new record
          const id = `url_${Date.now()}`;
          await dbInstance.prepare(`
            INSERT INTO CustomerAccountUrl 
            (id, conversationId, url, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?)
          `).bind(id, create.conversationId, create.url, now, now).run();
          
          return {
            id,
            ...create,
            createdAt: new Date(now),
            updatedAt: new Date(now)
          };
        }
      } catch (error) {
        console.error("Error upserting customer account URL:", error);
        throw error;
      }
    },
    
    // Find a customer account URL by conversation ID
    async findUnique({ where }) {
      if (!dbInstance) throw new Error("Database not initialized");
      
      try {
        const result = await dbInstance.prepare(`
          SELECT * FROM CustomerAccountUrl WHERE conversationId = ?
        `).bind(where.conversationId).first();
        
        if (!result) return null;
        
        return {
          ...result,
          createdAt: new Date(result.createdAt),
          updatedAt: new Date(result.updatedAt)
        };
      } catch (error) {
        console.error("Error finding customer account URL:", error);
        return null;
      }
    }
  }
};

export default d1PrismaWrapper;

// Named exports for individual models
export const codeVerifier = d1PrismaWrapper.codeVerifier;
export const customerToken = d1PrismaWrapper.customerToken;
export const conversation = d1PrismaWrapper.conversation;
export const message = d1PrismaWrapper.message;
export const customerAccountUrl = d1PrismaWrapper.customerAccountUrl;
