import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _pool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const pool =
  global._pool ??
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== "production") {
  global._pool = pool;
}
