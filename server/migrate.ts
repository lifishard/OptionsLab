// Phase 7b · in-place, idempotent migration (Postgres version).
//
// Postgres natively supports "ADD COLUMN IF NOT EXISTS", so unlike the old
// SQLite version we do not need to swallow "duplicate column" errors.
// Uses the raw postgres-js client via db.$client (a tagged-template query fn).

import { db } from "./storage";

const PORTFOLIO_COLUMNS: { name: string; ddl: string }[] = [
  { name: "thesis", ddl: "thesis TEXT" },
  { name: "opened_at", ddl: "opened_at BIGINT" },
  { name: "opened_spot", ddl: "opened_spot DOUBLE PRECISION" },
  { name: "target_pnl", ddl: "target_pnl DOUBLE PRECISION" },
  { name: "stop_loss", ddl: "stop_loss DOUBLE PRECISION" },
  { name: "status", ddl: "status TEXT NOT NULL DEFAULT 'open'" },
];

export async function migrate(): Promise<void> {
  const sql = db.$client;

  for (const col of PORTFOLIO_COLUMNS) {
    await sql.unsafe(`ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS ${col.ddl}`);
    console.log(`[migrate] portfolios +${col.name}`);
  }

  await sql.unsafe(`UPDATE portfolios SET status = 'open' WHERE status IS NULL`);

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
      snapshot_at BIGINT NOT NULL,
      spot DOUBLE PRECISION NOT NULL,
      pnl DOUBLE PRECISION NOT NULL,
      greeks_json TEXT NOT NULL
    )
  `);

  console.log("[migrate] Phase 7b ledger migration complete (Postgres)");
}
