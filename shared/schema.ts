import { pgTable, text, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const portfolios = pgTable("portfolios", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  legs: text("legs").notNull(),
  memo: text("memo"),
  createdAt: integer("created_at").notNull(),
  thesis: text("thesis"),
  openedAt: integer("opened_at"),
  openedSpot: real("opened_spot"),
  targetPnL: real("target_pnl"),
  stopLoss: real("stop_loss"),
  status: text("status").notNull().default("open"),
});

export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  portfolioId: integer("portfolio_id").notNull().references(() => portfolios.id),
  snapshotAt: integer("snapshot_at").notNull(),
  spot: real("spot").notNull(),
  pnl: real("pnl").notNull(),
  greeksJson: text("greeks_json").notNull(),
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

export const insertSnapshotSchema = z.object({
  spot: z.number(),
  pnl: z.number(),
  greeks: z.record(z.string(), z.number()),
});
