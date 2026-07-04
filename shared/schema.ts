import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ── Phase 7a: option-chain portfolio snapshots ──
// `legs` stores a JSON-stringified Leg[] (see client/src/lib/strategies/definitions.ts).
// Kept as text rather than a normalized table for MVP simplicity.
export const portfolios = sqliteTable("portfolios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(), // e.g. "移仓后", "Short Gamma 待移仓"
  legs: text("legs").notNull(), // JSON string of Leg[]
  memo: text("memo"), // optional
  createdAt: integer("created_at").notNull(),
});

export const insertPortfolioSchema = createInsertSchema(portfolios).pick({
  symbol: true,
  name: true,
  legs: true,
  memo: true,
});

export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;
export type Portfolio = typeof portfolios.$inferSelect;
