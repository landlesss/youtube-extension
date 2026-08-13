import pg from "pg";
import { config } from "../config.js";

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.nodeEnv === "production" ? { rejectUnauthorized: false } : undefined,
});

export interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  plan: string;
  created_at: Date;
}

export async function findOrCreateUserByGoogleSub(googleSub: string, email: string): Promise<UserRow> {
  const existing = await pool.query<UserRow>("SELECT * FROM users WHERE google_sub = $1", [googleSub]);
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await pool.query<UserRow>(
    `INSERT INTO users (google_sub, email, plan) VALUES ($1, $2, 'free')
     ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email
     RETURNING *`,
    [googleSub, email],
  );
  return inserted.rows[0];
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}
