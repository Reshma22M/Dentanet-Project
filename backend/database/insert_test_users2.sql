-- Insert Test Accounts into new auth tables
USE dentanet_lms3;

-- ADMIN
INSERT INTO admins (email, password_hash, first_name, last_name, must_change_password, is_active, created_at)
VALUES (
  'reshmamohamed@icloud.com',
  '$2b$10$KvKem9j4pstwvBLHy0ZgGuvFtrSeYUZVdKdVVKxqX2ZEDQ8ys7FGO',
  'Reshma', 'Mohamed', TRUE, TRUE, NOW()
)
ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash);

-- STUDENT
INSERT INTO students (email, password_hash, first_name, last_name, registration_number, department_id, is_active, created_at)
VALUES (
  'student@test.com',
  '$2b$10$abcdefghijklmnopqrstuvwxyz',
  'Test', 'Student', 'DENT/2024/001', (SELECT department_id FROM departments WHERE department_name = 'Restorative Dentistry'), TRUE, NOW()
)
ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash);

-- LECTURER
INSERT INTO lecturers (email, password_hash, first_name, last_name, staff_id, department_id, must_change_password, is_active, created_at)
VALUES (
  'lecturer@test.com',
  '$2b$10$abcdefghijklmnopqrstuvwxyz',
  'Test', 'Lecturer', 'LEC/001', (SELECT department_id FROM departments WHERE department_name = 'Restorative Dentistry'), TRUE, TRUE, NOW()
)
ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash);

-- Verification
SELECT 'Accounts ensured' AS message;
