const mysql = require("mysql2/promise");

async function run() {
  const pool = mysql.createPool({
    host: "localhost",
    user: "dentanet_user",
    password: "Resh21",
    database: "dentanet_lms"
  });

  // Intentionally left empty: legacy log/outbox tables are no longer bootstrapped.
  const tables = [];

  if (!tables.length) {
    console.log("No bootstrap tables configured.");
  }

  const [rows] = await pool.query("SHOW TABLES");
  console.log("\nAll tables in dentanet_lms:");
  rows.forEach((r) => console.log(" -", Object.values(r)[0]));

  process.exit();
}

run();
