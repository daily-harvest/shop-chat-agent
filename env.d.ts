/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

import type { PrismaClient } from "@prisma/client";

// Global type declarations for database access
declare global {
  var shopifyDb: PrismaClient | undefined;

  namespace globalThis {
    var shopifyDb: PrismaClient | undefined;
  }
}
