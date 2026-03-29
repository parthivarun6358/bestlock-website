require("dotenv").config();
const mysql = require("mysql2/promise");

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      connectTimeout: 10000,
    });

    const [rows] = await conn.query("SHOW DATABASES LIKE ?", [process.env.MYSQL_DATABASE]);
    console.log("Connected. DB exists:", rows.length > 0);

    await conn.query("USE `" + process.env.MYSQL_DATABASE + "`");
    console.log("USE ok");

    await conn.query("SELECT 1");
    console.log("SELECT ok");

    await conn.end();
  } catch (e) {
    console.error("CONNECT TEST FAILED");
    console.error(e && (e.stack || e));
    process.exitCode = 1;
  }
})();
