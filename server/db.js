// PostgreSQL connection, migrations and small query helpers.
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL || "postgres://localhost:5432/granvilles";
const ssl = process.env.PGSSL === "require" || /sslmode=require/.test(connectionString) ? { rejectUnauthorized: false } : undefined;
const pool = new Pool({ connectionString, ssl, max: Number(process.env.PG_POOL_MAX || 10) });

// numeric columns come back as strings by default; parse them as numbers
require("pg").types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
require("pg").types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const query = (text, params) => pool.query(text, params);
const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
const many = async (text, params) => (await pool.query(text, params)).rows;

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function migrate() {
  await query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const dir = path.join(__dirname, "db", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await many("select name from schema_migrations")).map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await tx(async (c) => {
      await c.query(sql);
      await c.query("insert into schema_migrations(name) values ($1)", [f]);
    });
    console.log("[db] applied migration", f);
  }
}

module.exports = { pool, query, one, many, tx, migrate };
