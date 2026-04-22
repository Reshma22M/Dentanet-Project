require("dotenv").config();
const mysql = require("mysql2");

// -----------------------------
// MySQL Connection Pool
// -----------------------------
const pool = mysql.createPool({
  // Keep connection details environment-driven for local/dev/prod portability.
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),

  // Reuse pooled connections to avoid reconnect overhead on every request.
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Promise wrapper keeps route code clean with async/await + try/catch.
const promisePool = pool.promise();

// -----------------------------
// Test DB Connection
// -----------------------------
pool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
  } else {
    console.log("✅ Database connected:", process.env.DB_NAME);
    // Release immediately: this check only verifies DB reachability at boot.
    connection.release();
  }
});

// -----------------------------
// Export
// -----------------------------
module.exports = {
  pool,
  promisePool,
};
