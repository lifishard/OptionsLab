import { users, portfolios, portfolioSnapshots } from '@shared/schema';
import type {
  User,
  InsertUser,
  Portfolio,
  InsertPortfolio,
  PortfolioSnapshot,
  InsertSnapshot,
  PatchPortfolio,
} from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, asc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  listPortfolios(symbol: string): Promise<Portfolio[]>;
  listAllPortfolios(): Promise<Portfolio[]>;
  getPortfolio(id: number): Promise<Portfolio | undefined>;
  createPortfolio(p: InsertPortfolio): Promise<Portfolio>;
  patchPortfolio(id: number, patch: PatchPortfolio): Promise<Portfolio | undefined>;
  deletePortfolio(id: number): Promise<void>;
  createSnapshot(portfolioId: number, s: InsertSnapshot): Promise<PortfolioSnapshot>;
  listSnapshots(portfolioId: number): Promise<PortfolioSnapshot[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values(insertUser).returning().get();
  }

  async listPortfolios(symbol: string): Promise<Portfolio[]> {
    return db
      .select()
      .from(portfolios)
      .where(eq(portfolios.symbol, symbol))
      .orderBy(desc(portfolios.createdAt))
      .all();
  }

  async getPortfolio(id: number): Promise<Portfolio | undefined> {
    return db.select().from(portfolios).where(eq(portfolios.id, id)).get();
  }

  async listAllPortfolios(): Promise<Portfolio[]> {
    return db.select().from(portfolios).orderBy(desc(portfolios.createdAt)).all();
  }

  async createPortfolio(p: InsertPortfolio): Promise<Portfolio> {
    const now = Date.now();
    return db
      .insert(portfolios)
      .values({
        ...p,
        createdAt: now,
        // Default openedAt/openedSpot to open-time if the client didn't supply them.
        openedAt: p.openedAt ?? now,
        status: p.status ?? "open",
      })
      .returning()
      .get();
  }

  async patchPortfolio(id: number, patch: PatchPortfolio): Promise<Portfolio | undefined> {
    // Drop undefined keys so we only touch the fields the caller sent.
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) clean[k] = v;
    }
    if (Object.keys(clean).length === 0) {
      return this.getPortfolio(id);
    }
    return db.update(portfolios).set(clean).where(eq(portfolios.id, id)).returning().get();
  }

  async deletePortfolio(id: number): Promise<void> {
    // Remove dependent snapshots first to respect the FK.
    db.delete(portfolioSnapshots).where(eq(portfolioSnapshots.portfolioId, id)).run();
    db.delete(portfolios).where(eq(portfolios.id, id)).run();
  }

  async createSnapshot(portfolioId: number, s: InsertSnapshot): Promise<PortfolioSnapshot> {
    return db
      .insert(portfolioSnapshots)
      .values({
        portfolioId,
        snapshotAt: Date.now(),
        spot: s.spot,
        pnl: s.pnl,
        greeksJson: JSON.stringify(s.greeks),
      })
      .returning()
      .get();
  }

  async listSnapshots(portfolioId: number): Promise<PortfolioSnapshot[]> {
    return db
      .select()
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.portfolioId, portfolioId))
      .orderBy(asc(portfolioSnapshots.snapshotAt))
      .all();
  }
}

export const storage = new DatabaseStorage();
