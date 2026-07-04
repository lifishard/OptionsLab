import { users, portfolios } from '@shared/schema';
import type { User, InsertUser, Portfolio, InsertPortfolio } from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  listPortfolios(symbol: string): Promise<Portfolio[]>;
  getPortfolio(id: number): Promise<Portfolio | undefined>;
  createPortfolio(p: InsertPortfolio): Promise<Portfolio>;
  deletePortfolio(id: number): Promise<void>;
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

  async createPortfolio(p: InsertPortfolio): Promise<Portfolio> {
    return db.insert(portfolios).values({ ...p, createdAt: Date.now() }).returning().get();
  }

  async deletePortfolio(id: number): Promise<void> {
    db.delete(portfolios).where(eq(portfolios.id, id)).run();
  }
}

export const storage = new DatabaseStorage();
