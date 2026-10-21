// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('workspaces', {
  owner: text('owner').primaryKey(), payload: text('payload').notNull(),
  version: integer('version').notNull().default(1), updatedAt: text('updated_at').notNull(),
});
