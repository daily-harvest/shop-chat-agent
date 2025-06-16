/**
 * This file provides a mock PrismaClient for Cloudflare Workers
 * It will be used when the bundler tries to include Prisma in the Cloudflare bundle,
 * ensuring that the real Prisma client isn't included but that imports don't fail.
 */

class MockPrismaClient {
  constructor() {
    throw new Error(
      "PrismaClient is not configured to run in Cloudflare Workers. Use the DB adapter instead."
    );
  }
}

export const PrismaClient = MockPrismaClient;
export default { PrismaClient: MockPrismaClient };
