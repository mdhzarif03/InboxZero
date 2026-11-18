import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __inboxzeroPrisma: PrismaClient | undefined;
}

export const db: PrismaClient =
  globalThis.__inboxzeroPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__inboxzeroPrisma = db;
}
