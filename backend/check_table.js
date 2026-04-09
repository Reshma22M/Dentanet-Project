const mysql = require('mysql2/promise');

async function run() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'dentanet_user',
    password: 'Resh21',
    database: 'dentanet_lms'
  });

  const tables = [
    {
      name: 'audit_logs',
      sql: `CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        user_role VARCHAR(50),
        action VARCHAR(255),
        table_name VARCHAR(100),
        record_id INT,
        old_values JSON,
        new_values JSON,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`
    },
    {
      name: 'api_logs',
      sql: `CREATE TABLE IF NOT EXISTS api_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        method VARCHAR(10),
        path VARCHAR(500),
        status_code INT,
        response_time_ms INT,
        user_id INT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`
    },
    {
      name: 'email_outbox',
      sql: `CREATE TABLE IF NOT EXISTS email_outbox (
        id INT AUTO_INCREMENT PRIMARY KEY,
        to_email VARCHAR(255) NOT NULL,
        subject VARCHAR(500),
        body TEXT,
        status ENUM('PENDING','SENT','FAILED') DEFAULT 'PENDING',
        error_message TEXT,
        sent_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`
    }
  ];

  for (const t of tables) {
    try {
      await pool.query(t.sql);
      console.log('✓ Created:', t.name);
    } catch (e) {
      console.log('✗ Error creating', t.name, ':', e.message);
    }
  }

  // Verify all tables now exist
  const [rows] = await pool.query('SHOW TABLES');
  console.log('\nAll tables in dentanet_lms:');
  rows.forEach(r => console.log(' -', Object.values(r)[0]));

  process.exit();
}

run();
