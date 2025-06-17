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
  // Initialize the DB if available
  if (context.cloudflare?.env) {

    
    // Make DB directly accessible in global namespace for easier access
    if (typeof global !== 'undefined' && (context.cloudflare.env as any).DB) {
      global.d1GlobalDb = (context.cloudflare.env as any).DB;
    }
    
    // Make DB available on globalThis as well
    if ((context.cloudflare.env as any).DB) {
      globalThis.shopifyDb = (context.cloudflare.env as any).DB;
    }
  }
  
  return context;
}