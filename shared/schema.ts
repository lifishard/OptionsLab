import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
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
//
// Phase 7b · Portfolio Ledger extension. All new columns are nullable (or have a
// default) so the pre-existing Phase 7a rows stay valid after an in-place
// ALTER TABLE migration (see server/migrate.ts) — never drop-recreate.
export const portfolios = sqliteTable("portfolios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(), // e.g. "移仓后", "Short Gamma 待移仓"
  legs: text("legs").notNull(), // JSON string of Leg[]
  memo: text("memo"), // optional
  createdAt: integer("created_at").notNull(),
  // ── Phase 7b · Ledger ──
  thesis: text("thesis"), // 开仓时的判断（老欧：先想清楚为什么开这个仓）
  openedAt: integer("opened_at"), // 开仓时间 (epoch ms)
  openedSpot: real("opened_spot"), // 开仓时的现价
  targetPnL: real("target_pnl"), // 止盈金额（美元）
  stopLoss: real("stop_loss"), // 止损金额（美元）
  status: text("status").notNull().default("open"), // "open" | "closed" | "rolled"
});

export const insertPortfolioSchema = createInsertSchema(portfolios).pick({
  symbol: true,
  name: true,
  legs: true,
  memo: true,
  thesis: true,
  openedAt: true,
  openedSpot: true,
  targetPnL: true,
  stopLoss: true,
  status: true,
});

export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;
export type Portfolio = typeof portfolios.$inferSelect;

// Fields the ledger UI may PATCH after open. All optional.
export const patchPortfolioSchema = z.object({
  thesis: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  name: z.string().min(1).optional(),
  targetPnL: z.number().nullable().optional(),
  stopLoss: z.number().nullable().optional(),
  openedAt: z.number().nullable().optional(),
  openedSpot: z.number().nullable().optional(),
  status: z.enum(["open", "closed", "rolled"]).optional(),
});
export type PatchPortfolio = z.infer<typeof patchPortfolioSchema>;

// ── Phase 7b · daily portfolio snapshots (manual "Take Snapshot" for now) ──
export const portfolioSnapshots = sqliteTable("portfolio_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  portfolioId: integer("portfolio_id")
    .notNull()
    .references(() => portfolios.id),
  snapshotAt: integer("snapshot_at").notNull(), // epoch ms
  spot: real("spot").notNull(),
  pnl: real("pnl").notNull(),
  greeksJson: text("greeks_json").notNull(), // JSON string of aggregate greeks
});

export const insertSnapshotSchema = z.object({
  spot: z.number(),
  pnl: z.number(),
  greeks: z.record(z.string(), z.number()),
});
export type InsertSnapshot = z.infer<typeof insertSnapshotSchema>;
export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
