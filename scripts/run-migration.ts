import { pool } from "../lib/db";
import fs from "fs";
import path from "path";

async function run() {
  try {
    const filePath = path.join(process.cwd(), "db/migrations/001_workout_logging.sql");
    const sql = fs.readFileSync(filePath, "utf-8");

    console.log("Running migration...");

    await pool.query(sql);

    console.log("Migration completed ✅");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed ❌", err);
    process.exit(1);
  }
}

run();