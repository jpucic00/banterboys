import path from "node:path";
import { defineConfig } from "prisma/config";
import { config } from "dotenv";

config();

export default defineConfig({
  schema: path.join(import.meta.dirname, "prisma", "schema.prisma"),
  migrate: {
    migrationsDir: path.join(import.meta.dirname, "prisma", "migrations"),
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
