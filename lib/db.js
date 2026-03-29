const mysql = require("mysql2/promise");

let pool;

function isDbConfigured() {
  return Boolean(
    process.env.MYSQL_HOST &&
      process.env.MYSQL_USER &&
      process.env.MYSQL_DATABASE &&
      typeof process.env.MYSQL_PASSWORD !== "undefined"
  );
}

function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 5),
    queueLimit: 0,
  });
  return pool;
}

async function saveContact({ name, email, message }) {
  if (!isDbConfigured()) return { ok: false, skipped: true, reason: "DB not configured" };
  if (String(process.env.MYSQL_HOST).toLowerCase() === "localhost") {
    return { ok: false, skipped: true, reason: "DB host is localhost (not reachable from Vercel)" };
  }

  const p = getPool();
  await p.execute("INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)", [
    name,
    email,
    message,
  ]);
  return { ok: true };
}

module.exports = {
  saveContact,
};

