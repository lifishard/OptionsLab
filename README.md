# OptionsLab

美股期权交互学习网站 · Interactive learning lab for US options.

BSM pricing · Greeks · 32 strategies · payoff builder · scenario stress · roll engine · decision copilot · portfolio ledger.

## Stack

- **Frontend**: React 18 + Vite + Tailwind + shadcn/ui + wouter + TanStack Query
- **Backend**: Express 5 + Drizzle ORM + Postgres (`postgres-js`)
- **Data**: `yahoo-finance2` for live chains/quotes (SPY, QQQ, AAPL, NVDA, TSLA warm-cached at boot)
- **Tests**: Vitest (79 tests across BSM / payoff / scenario / roll / copilot / chain-math / yfinance)

## Local dev

```bash
npm install
cp env.example .env      # fill in DATABASE_URL
npm run dev              # http://localhost:5000
```

You need a Postgres instance. Easiest options:
- Docker: `docker run -p 5432:5432 -e POSTGRES_PASSWORD=pw -d postgres:16`
- [Supabase](https://supabase.com/) free tier (use the pooler URL, port 6543)
- Railway Postgres plugin

The server runs an idempotent migration on every boot (`server/migrate.ts`) — no separate `db:push` needed.

## Deploy to Railway

1. Create a new Railway project from this GitHub repo.
2. Add the **Postgres** plugin from the Railway marketplace.
3. In the OptionsLab service → **Variables**, add:
   - `DATABASE_URL` = `${{ Postgres.DATABASE_URL }}` (reference the plugin)
   - `NODE_ENV` = `production`
4. Railway auto-detects `nixpacks.toml` + `railway.toml`. Build/start:
   - Build: `npm ci --include=dev && npm run build` (via nixpacks)
   - Start: `npm start` → `node dist/index.cjs`
   - Health: `GET /api/health` (Railway waits for 200 before routing)

The migration in `server/migrate.ts` runs at boot and creates:
- `users` (SERIAL PK)
- `portfolios` (with all Phase 7b columns: thesis / opened_at / opened_spot / target_pnl / stop_loss / status)
- `portfolio_snapshots`

All statements use `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, so redeploys are safe.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server (Vite middleware + Express, port 5000) |
| `npm run build` | Bundles client (Vite → `dist/public`) + server (esbuild → `dist/index.cjs`) |
| `npm start` | Production server (`node dist/index.cjs`) |
| `npm test` | Vitest suite (79 tests) |
| `npm run check` | Type-check |
| `npm run db:push` | Optional — push schema without the migration script |

## Project layout

```
client/     React app
server/     Express server (index / routes / storage / migrate / yfinance / static / vite)
shared/     Drizzle schema + Zod validators shared between client and server
script/     esbuild + Vite build orchestration
docs/       Design notes (老欧 quotes, OptionsWave analysis, etc.)
```

## License

MIT.
