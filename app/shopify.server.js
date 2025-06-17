import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import getPrisma from "./db.server";

// Create a custom session storage that delays Prisma initialization
class LazyPrismaSessionStorage {
  constructor() {
    this._storage = null;
  }

  _getStorage() {
    if (!this._storage) {
      this._storage = new PrismaSessionStorage(getPrisma());
    }
    return this._storage;
  }

  async storeSession(session) {
    return this._getStorage().storeSession(session);
  }

  async loadSession(id) {
    return this._getStorage().loadSession(id);
  }

  async deleteSession(id) {
    return this._getStorage().deleteSession(id);
  }

  async deleteSessions(ids) {
    return this._getStorage().deleteSessions(ids);
  }

  async findSessionsByShop(shop) {
    return this._getStorage().findSessionsByShop(shop);
  }
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new LazyPrismaSessionStorage(),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
