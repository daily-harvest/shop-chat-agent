import { type PlatformProxy } from "wrangler";

type GetLoadContextArgs = {
  request: Request;
  context: {
    cloudflare: Omit<PlatformProxy<Env>, "dispose" | "caches" | "cf"> & {
      caches: PlatformProxy<Env>["caches"] | CacheStorage;
      cf: Request["cf"];
    };
  };
};

declare module "@remix-run/cloudflare" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface AppLoadContext extends ReturnType<typeof getLoadContext> {
    // This will merge the result of `getLoadContext` into the `AppLoadContext`
  }
}

export function getLoadContext({ context }: GetLoadContextArgs) {
  // Initialize the DB if available and not already initialized
  if (context.cloudflare?.env?.DB && !global.shopifyDb) {
    try {
      const { PrismaClient } = require("@prisma/client");
      const { PrismaD1 } = require("@prisma/adapter-d1");
      global.shopifyDb = new PrismaClient({ 
        adapter: new PrismaD1(context.cloudflare.env.DB),
        log: ['error', 'warn']
      });
      console.log("Prisma Client initialized with D1 adapter");
    } catch (error) {
      console.error("Failed to initialize Prisma Client:", error);
    }
  }
  
  return context;
}