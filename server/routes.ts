import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { storage } from "./storage";
import { getOptionChain, warmCache } from "./yfinance";
import {
  insertPortfolioSchema,
  insertSnapshotSchema,
  patchPortfolioSchema,
} from "@shared/schema";

// First 5 tickers to warm-cache on server start. Fire-and-forget: failures
// must not block startup (handled inside warmCache).
const WARM_TICKERS = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA"];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // prefix all routes with /api
  // use storage to perform CRUD operations on the storage interface
  // e.g. app.get("/api/items", async (_req, res) => { ... })

  warmCache(WARM_TICKERS);

  // ── Option chain ──
  app.get("/api/chain/:symbol", async (req, res) => {
    const symbol = String(req.params.symbol || "").trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ error: "缺少标的代码" });
    }
    try {
      const snapshot = await getOptionChain(symbol);
      res.json(snapshot);
    } catch (err: any) {
      res.status(502).json({ error: err?.message || `读取 ${symbol} 期权链失败` });
    }
  });

  // ── Ledger · list ALL portfolios across symbols (Phase 7b) ──
  // Declared BEFORE /:symbol so the literal "all" segment wins the match.
  app.get("/api/portfolios/all", async (_req, res) => {
    try {
      const list = await storage.listAllPortfolios();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "读取全部持仓失败" });
    }
  });

  // ── Portfolio snapshots ──
  app.get("/api/portfolios/:symbol", async (req, res) => {
    const symbol = String(req.params.symbol || "").trim().toUpperCase();
    try {
      const list = await storage.listPortfolios(symbol);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "读取持仓快照失败" });
    }
  });

  // ── Ledger · daily PnL/greeks snapshots for one portfolio (Phase 7b) ──
  app.get("/api/portfolios/:id/snapshots", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "无效的持仓 ID" });
    }
    try {
      const list = await storage.listSnapshots(id);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "读取快照失败" });
    }
  });

  app.post("/api/portfolios/:id/snapshots", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "无效的持仓 ID" });
    }
    const parsed = insertSnapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "快照数据格式不对", details: parsed.error.flatten() });
    }
    try {
      const existing = await storage.getPortfolio(id);
      if (!existing) {
        return res.status(404).json({ error: "找不到这个持仓" });
      }
      const created = await storage.createSnapshot(id, parsed.data);
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "保存快照失败" });
    }
  });

  // ── Ledger · update thesis / target / stop / status (Phase 7b) ──
  app.patch("/api/portfolios/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "无效的持仓 ID" });
    }
    const parsed = patchPortfolioSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "更新数据格式不对", details: parsed.error.flatten() });
    }
    try {
      const updated = await storage.patchPortfolio(id, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "找不到这个持仓" });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "更新持仓失败" });
    }
  });

  app.post("/api/portfolios", async (req, res) => {
    const parsed = insertPortfolioSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "持仓快照数据格式不对", details: parsed.error.flatten() });
    }
    try {
      const created = await storage.createPortfolio(parsed.data);
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "保存持仓快照失败" });
    }
  });

  app.delete("/api/portfolios/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "无效的持仓 ID" });
    }
    try {
      await storage.deletePortfolio(id);
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "删除持仓快照失败" });
    }
  });

  return httpServer;
}
