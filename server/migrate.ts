// Phase 7b · in-place, idempotent migration (Postgres version).
//
// Postgres natively supports "CREATE TABLE IF NOT EXISTS" and
// "ADD COLUMN IF NOT EXISTS", so unlike the old SQLite version we do not
// need to swallow "duplicate column" errors. Safe to run on every boot.
//
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

  // ── Base tables ──────────────────────────────────────────────
  // Fresh Railway/Supabase Postgres arrives EMPTY. We create the two core
  // tables here so first boot Just Works — no separate `db:push` step.

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    )
  `);

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      legs TEXT NOT NULL,
      memo TEXT,
      created_at BIGINT NOT NULL
    )
  `);

  // ── Phase 7b · additive columns on portfolios ────────────────
  for (const col of PORTFOLIO_COLUMNS) {
    await sql.unsafe(`ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS ${col.ddl}`);
    console.log(`[migrate] portfolios +${col.name}`);
  }

  await sql.unsafe(`UPDATE portfolios SET status = 'open' WHERE status IS NULL`);

  // ── Phase 7b · portfolio_snapshots table ─────────────────────
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

  // ── Phase 8 · options_snapshots cache table ──────────────────
  // Durable fallback so a Yahoo 429 storm on Railway doesn't wipe the chain
  // page. UNIQUE(symbol) lets us upsert with ON CONFLICT.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS options_snapshots (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL UNIQUE,
      fetched_at BIGINT NOT NULL,
      payload TEXT NOT NULL
    )
  `);
  console.log("[migrate] options_snapshots ready");

  console.log("[migrate] Phase 7b ledger migration complete (Postgres)");
}
