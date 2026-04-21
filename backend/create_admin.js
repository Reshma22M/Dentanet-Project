//manual admin seeding/reset script

const bcrypt = require("bcrypt");
const mysql = require("mysql2");
require("dotenv").config();

const pool = mysql
  .createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  })
  .promise();

function argOrEnv(index, envKey, fallback = "") {
  const cliValue = process.argv[index];
  if (cliValue && String(cliValue).trim()) return String(cliValue).trim();
  if (process.env[envKey] && String(process.env[envKey]).trim()) {
    return String(process.env[envKey]).trim();
  }
  return fallback;
}

async function createAdmin() {
  try {
    const email = argOrEnv(2, "ADMIN_EMAIL", "admin@dentanet.com").toLowerCase();
    const password = argOrEnv(3, "ADMIN_PASSWORD", "Admin@123");
    const firstName = argOrEnv(4, "ADMIN_FIRST_NAME", "System");
    const lastName = argOrEnv(5, "ADMIN_LAST_NAME", "Admin");
    const mustChangePassword =
      argOrEnv(6, "ADMIN_MUST_CHANGE_PASSWORD", "false").toLowerCase() === "true";

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      `
      INSERT INTO admins (email, password_hash, first_name, last_name, must_change_password, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, TRUE, NOW())
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        first_name = VALUES(first_name),
        last_name = VALUES(last_name),
        must_change_password = VALUES(must_change_password),
        is_active = TRUE
    `,
      [email, hash, firstName, lastName, mustChangePassword]
    );

    console.log("Admin user is ready.");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
  } catch (error) {
    console.error("Failed to create admin:", error.message || error);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}

createAdmin();
