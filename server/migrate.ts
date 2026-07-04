// Phase 7b · in-place, idempotent migration.
//
// Pre-existing Phase 7a `portfolios` rows must survive — so we ADD COLUMN one
// field at a time (SQLite has no "ADD COLUMN IF NOT EXISTS"), swallowing the
// "duplicate column name" error when a column already exists. The
// portfolio_snapshots table is created with CREATE TABLE IF NOT EXISTS.
//
// Uses the raw better-sqlite3 handle via db.$client so we never touch Drizzle's
// schema push (which would want to drop-recreate).

import type Database from "better-sqlite3";
import { db } from "./storage";

// Column definitions appended to the existing portfolios table.
const PORTFOLIO_COLUMNS: { name: string; ddl: string }[] = [
  { name: "thesis", ddl: "thesis TEXT" },
  { name: "opened_at", ddl: "opened_at INTEGER" },
  { name: "opened_spot", ddl: "opened_spot REAL" },
  { name: "target_pnl", ddl: "target_pnl REAL" },
  { name: "stop_loss", ddl: "stop_loss REAL" },
  { name: "status", ddl: "status TEXT NOT NULL DEFAULT 'open'" },
];

function isDuplicateColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate column name/i.test(msg);
}

export function migrate(): void {
  const client = db.$client as Database.Database;

  // 1. portfolios — add each Ledger column if missing.
  for (const col of PORTFOLIO_COLUMNS) {
    try {
      client.prepare(`ALTER TABLE portfolios ADD COLUMN ${col.ddl}`).run();
      console.log(`[migrate] portfolios +${col.name}`);
    } catch (err) {
      if (!isDuplicateColumnError(err)) throw err;
      // column already exists — safe to ignore.
    }
  }

  // Backfill status on any legacy row where it landed NULL (older ADD COLUMN
  // without default, defensive — the DEFAULT above normally covers this).
  try {
    client.prepare(`UPDATE portfolios SET status = 'open' WHERE status IS NULL`).run();
  } catch {
    // ignore
  }

  // 2. portfolio_snapshots — create fresh if it does not exist.
  client
    .prepare(
      `CREATE TABLE IF NOT EXISTS portfolio_snapshots (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
         snapshot_at INTEGER NOT NULL,
         spot REAL NOT NULL,
         pnl REAL NOT NULL,
         greeks_json TEXT NOT NULL
       )`,
    )
    .run();

  console.log("[migrate] Phase 7b ledger migration complete");
}
