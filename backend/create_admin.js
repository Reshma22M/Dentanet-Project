const bcrypt = require('bcrypt');
const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
}).promise();

async function createAdmin() {
  try {
    const hash = await bcrypt.hash('admin123', 10);
    await pool.query(`
      INSERT INTO admins (email, password_hash, first_name, last_name, must_change_password, is_active, created_at)
      VALUES (?, ?, 'Reshma', 'Admin', FALSE, TRUE, NOW())
      ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
    `, ['reshmamohamed@icloud.com', hash]);
    console.log('✅ Custom Admin created successfully! Email: reshmamohamed@icloud.com | Password: admin123');
  } catch (error) {
    console.error('❌ Failed to create admin:', error);
  } finally {
    process.exit(0);
  }
}

createAdmin();
