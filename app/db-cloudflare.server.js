import { Session } from "@shopify/shopify-api";
// import { SessionStorage } from "@shopify/shopify-app-session-storage";

// Module level DB instance
let dbInstance = null;

// Define a custom D1 session storage adapter
export class D1SessionStorage {
  /**
   * Store a session in the database
   * @param {Session} session - The session to store
   * @returns {Promise<boolean>} Success or failure
   */
  async storeSession(session) {
    if (!dbInstance) {
      console.error("D1 database not initialized");
      return false;
    }

    try {
      await dbInstance.prepare(`
        INSERT OR REPLACE INTO shopify_sessions
        (id, shop, state, isOnline, scope, accessToken, expires, onlineAccessInfo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        session.id || null,
        session.shop || null,
        session.state || null,
        session.isOnline ? 1 : 0,
        session.scope || null,
        session.accessToken || null,
        session.expires ? session.expires.getTime() : null,
        session.onlineAccessInfo ? JSON.stringify(session.onlineAccessInfo) : null
      ).run();
      return true;
    } catch (error) {
      console.error("Failed to store session:", error);
      return false;
    }
  }

  /**
   * Load a session from the database
   * @param {string} id - The session ID
   * @returns {Promise<Session|undefined>} The session or undefined
   */
  async loadSession(id) {
    if (!dbInstance) {
      console.error("D1 database not initialized");
      return undefined;
    }

    try {
      const result = await dbInstance.prepare(`
        SELECT * FROM shopify_sessions WHERE id = ?
      `).bind(id || null).first();
      
      if (!result) return undefined;
      
      const session = new Session({
        id: result.id,
        shop: result.shop,
        state: result.state,
        isOnline: Boolean(result.isOnline),
      });

      session.scope = result.scope;
      session.accessToken = result.accessToken;
      
      if (result.expires) {
        session.expires = new Date(result.expires);
      }
      
      if (result.onlineAccessInfo) {
        session.onlineAccessInfo = JSON.parse(result.onlineAccessInfo);
      }
      
      return session;
    } catch (error) {
      console.error("Failed to load session:", error);
      return undefined;
    }
  }

  /**
   * Delete a session from the database
   * @param {string} id - The session ID
   * @returns {Promise<boolean>} Success or failure
   */
  async deleteSession(id) {
    if (!dbInstance) {
      console.error("D1 database not initialized");
      return false;
    }

    try {
      await dbInstance.prepare(`
        DELETE FROM shopify_sessions WHERE id = ?
      `).bind(id || null).run();
      return true;
    } catch (error) {
      console.error("Failed to delete session:", error);
      return false;
    }
  }

  /**
   * Delete multiple sessions from the database
   * @param {string[]} ids - The session IDs
   * @returns {Promise<boolean>} Success or failure
   */
  async deleteSessions(ids) {
    if (!dbInstance) {
      console.error("D1 database not initialized");
      return false;
    }

    try {
      for (const id of ids) {
        await this.deleteSession(id);
      }
      return true;
    } catch (error) {
      console.error("Failed to delete sessions:", error);
      return false;
    }
  }

  /**
   * Find sessions by shop
   * @param {string} shop - The shop name
   * @returns {Promise<Session[]>} The sessions
   */
  async findSessionsByShop(shop) {
    if (!dbInstance) {
      console.error("D1 database not initialized");
      return [];
    }

    try {
      const results = await dbInstance.prepare(`
        SELECT * FROM shopify_sessions WHERE shop = ?
      `).bind(shop || null).all();
      
      return results.results.map(result => {
        const session = new Session({
          id: result.id,
          shop: result.shop,
          state: result.state,
          isOnline: Boolean(result.isOnline),
        });

        session.scope = result.scope;
        session.accessToken = result.accessToken;
        
        if (result.expires) {
          session.expires = new Date(result.expires);
        }
        
        if (result.onlineAccessInfo) {
          session.onlineAccessInfo = JSON.parse(result.onlineAccessInfo);
        }
        
        return session;
      });
    } catch (error) {
      console.error("Failed to find sessions by shop:", error);
      return [];
    }
  }
}

// Create a single instance of the session storage
export const sessionStorage = new D1SessionStorage();

/**
 * Initialize the database for session storage
 * @param {any} db - The D1 database instance
 * @returns {Promise<boolean>} Success or failure
 */
export async function initializeDb(db) {
  try {
    // Create the sessions table if it doesn't exist
    await db.exec(`CREATE TABLE IF NOT EXISTS shopify_sessions
      (id TEXT PRIMARY KEY, shop TEXT NOT NULL, state TEXT, isOnline INTEGER, scope
      TEXT, accessToken TEXT, expires INTEGER, onlineAccessInfo TEXT)`);

    // Set the module DB instance
    dbInstance = db;
    
    console.log("D1 database initialized successfully for session storage");
    return true;
  } catch (error) {
    console.error("Failed to initialize D1 database:", error);
    return false;
  }
}
