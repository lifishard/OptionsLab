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
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, desc, asc } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to your environment variables.");
}

// Suppress the flood of "relation ... already exists, skipping" NOTICE lines
// that our idempotent migration produces on every boot. Real errors still
// bubble up as exceptions on the query itself.
const client = postgres(process.env.DATABASE_URL, {
  onnotice: () => {},
});

export const db = drizzle(client);

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
  async getUser(id: number) {
    const rows = await db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }

  async getUserByUsername(username: string) {
    const rows = await db.select().from(users).where(eq(users.username, username));
    return rows[0];
  }

  async createUser(insertUser: InsertUser) {
    const rows = await db.insert(users).values(insertUser).returning();
    return rows[0];
  }

  async listPortfolios(symbol: string) {
    return db
      .select()
      .from(portfolios)
      .where(eq(portfolios.symbol, symbol))
      .orderBy(desc(portfolios.createdAt));
  }

  async getPortfolio(id: number) {
    const rows = await db.select().from(portfolios).where(eq(portfolios.id, id));
    return rows[0];
  }

  async listAllPortfolios() {
    return db.select().from(portfolios).orderBy(desc(portfolios.createdAt));
  }

  async createPortfolio(p: InsertPortfolio) {
    const now = Date.now();
    const rows = await db
      .insert(portfolios)
      .values({
        ...p,
        createdAt: now,
        openedAt: p.openedAt ?? now,
        status: p.status ?? "open",
      })
      .returning();
    return rows[0];
  }

  async patchPortfolio(id: number, patch: PatchPortfolio) {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) clean[k] = v;
    }
    if (Object.keys(clean).length === 0) {
      return this.getPortfolio(id);
    }
    const rows = await db.update(portfolios).set(clean).where(eq(portfolios.id, id)).returning();
    return rows[0];
  }

  async deletePortfolio(id: number) {
    await db.delete(portfolioSnapshots).where(eq(portfolioSnapshots.portfolioId, id));
    await db.delete(portfolios).where(eq(portfolios.id, id));
  }

  async createSnapshot(portfolioId: number, s: InsertSnapshot) {
    const rows = await db
      .insert(portfolioSnapshots)
      .values({
        portfolioId,
        snapshotAt: Date.now(),
        spot: s.spot,
        pnl: s.pnl,
        greeksJson: JSON.stringify(s.greeks),
      })
      .returning();
    return rows[0];
  }

  async listSnapshots(portfolioId: number) {
    return db
      .select()
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.portfolioId, portfolioId))
      .orderBy(asc(portfolioSnapshots.snapshotAt));
  }
}

export const storage = new DatabaseStorage();
