require("dotenv").config();
const mysql = require("mysql2");

// -----------------------------
// MySQL Connection Pool
// -----------------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Promise wrapper (recommended for async/await)
const promisePool = pool.promise();

// -----------------------------
// Test DB Connection
// -----------------------------
pool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
  } else {
    console.log("✅ Database connected:", process.env.DB_NAME);
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