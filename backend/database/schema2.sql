-- DentaNet LMS - Clean Final Schema
-- Use this on a fresh database or after taking a backup.

CREATE DATABASE IF NOT EXISTS dentanet_lms3
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE dentanet_lms3;

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- 1) Core reference tables
-- ------------------------------------------------------------
CREATE TABLE departments (
  department_id INT AUTO_INCREMENT PRIMARY KEY,
  department_name VARCHAR(150) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2) Users
-- ------------------------------------------------------------
CREATE TABLE admins (
  admin_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  profile_image_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE students (
  student_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  registration_number VARCHAR(50) NOT NULL UNIQUE,
  department_id INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  profile_image_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_students_department
    FOREIGN KEY (department_id)
    REFERENCES departments(department_id)
    ON DELETE RESTRICT,

  CONSTRAINT chk_reg_strict
    CHECK (
      registration_number REGEXP '^DENT/(20[0-2][0-9]|2030)/(00[1-9]|0[1-9][0-9]|1[0-9][0-9]|200)$'
    ),

  INDEX idx_student_dept (department_id)
) ENGINE=InnoDB;

CREATE TABLE lecturers (
  lecturer_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  staff_id VARCHAR(50) UNIQUE,
  department_id INT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  profile_image_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_lecturers_department
    FOREIGN KEY (department_id)
    REFERENCES departments(department_id)
    ON DELETE RESTRICT,

  INDEX idx_lecturer_dept (department_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3) Password reset
-- ------------------------------------------------------------
CREATE TABLE password_reset_tokens (
  token_id INT AUTO_INCREMENT PRIMARY KEY,
  account_type ENUM('admin','student','lecturer') NOT NULL,
  account_id INT NOT NULL,
  otp_code VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  attempts INT NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_prt_account (account_type, account_id),
  INDEX idx_prt_email (email),
  INDEX idx_prt_expires (expires_at),
  INDEX idx_prt_used (is_used)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4) Lab machines + booking workflow
-- ------------------------------------------------------------
CREATE TABLE lab_machines (
  machine_id INT AUTO_INCREMENT PRIMARY KEY,
  machine_code VARCHAR(20) NOT NULL UNIQUE,
  lab_number VARCHAR(20) NOT NULL,
  status ENUM('ready','maintenance','unavailable') NOT NULL DEFAULT 'ready',
  last_maintenance_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_machine_status (status),
  INDEX idx_machine_lab (lab_number)
) ENGINE=InnoDB;

CREATE TABLE slot_requests (
  request_id INT AUTO_INCREMENT PRIMARY KEY,
  student_user_id INT NOT NULL,
  slot_type ENUM('PRACTICE','EXAM') NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status ENUM('PENDING','APPROVED','DENIED','CANCELLED','COMPLETED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_slotreq_student
    FOREIGN KEY (student_user_id) REFERENCES students(student_id)
    ON DELETE CASCADE,

  INDEX idx_slotreq_student (student_user_id),
  INDEX idx_slotreq_date (booking_date),
  INDEX idx_slotreq_type (slot_type),
  INDEX idx_slotreq_status (status)
) ENGINE=InnoDB;

CREATE TABLE slot_allocations (
  allocation_id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL UNIQUE,
  machine_id INT NOT NULL,
  approved_by INT NULL,
  approved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_alloc_request
    FOREIGN KEY (request_id) REFERENCES slot_requests(request_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_alloc_machine
    FOREIGN KEY (machine_id) REFERENCES lab_machines(machine_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_alloc_approved_by
    FOREIGN KEY (approved_by) REFERENCES admins(admin_id)
    ON DELETE SET NULL,

  INDEX idx_alloc_machine (machine_id),
  INDEX idx_alloc_approved_by (approved_by),
  INDEX idx_alloc_approved_at (approved_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5) Academic structure
-- ------------------------------------------------------------
CREATE TABLE modules (
  module_id INT AUTO_INCREMENT PRIMARY KEY,
  module_code VARCHAR(30) NOT NULL UNIQUE,
  module_name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  module_image_url VARCHAR(500) NULL,
  created_by INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_modules_created_by
    FOREIGN KEY (created_by) REFERENCES admins(admin_id)
    ON DELETE SET NULL,

  INDEX idx_modules_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE module_lecturers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module_id INT NOT NULL,
  lecturer_id INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_module_lecturer (module_id, lecturer_id),
  CONSTRAINT fk_ml_module FOREIGN KEY (module_id) REFERENCES modules(module_id) ON DELETE CASCADE,
  CONSTRAINT fk_ml_lecturer FOREIGN KEY (lecturer_id) REFERENCES lecturers(lecturer_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE exams (
  exam_id INT AUTO_INCREMENT PRIMARY KEY,
  module_id INT NOT NULL,
  exam_name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  exam_date DATE NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  max_attempts INT NOT NULL DEFAULT 1,
  passing_grade DECIMAL(5,2) NULL,
  status ENUM('DRAFT','SCHEDULED','OPEN','CLOSED') NOT NULL DEFAULT 'DRAFT',
  created_by INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_exams_module
    FOREIGN KEY (module_id) REFERENCES modules(module_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_exams_created_by
    FOREIGN KEY (created_by) REFERENCES lecturers(lecturer_id)
    ON DELETE CASCADE,

  INDEX idx_exams_module (module_id),
  INDEX idx_exams_active (is_active),
  INDEX idx_exams_status (status),
  INDEX idx_exams_date (exam_date)
) ENGINE=InnoDB;

CREATE TABLE exam_time_slots (
  slot_id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_machines INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_exam_time_slots_exam
    FOREIGN KEY (exam_id) REFERENCES exams(exam_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_exam_time_slots_admin
    FOREIGN KEY (created_by) REFERENCES admins(admin_id)
    ON DELETE SET NULL,

  INDEX idx_exam_slots_exam (exam_id),
  INDEX idx_exam_slots_date (slot_date),
  INDEX idx_exam_slots_active (is_active)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 6) Slot type detail tables
-- ------------------------------------------------------------
CREATE TABLE practice_slot_requests (
  request_id INT PRIMARY KEY,
  purpose VARCHAR(255) NULL,
  module_id INT NULL,

  CONSTRAINT fk_practice_slot_request
    FOREIGN KEY (request_id) REFERENCES slot_requests(request_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_practice_module_id
    FOREIGN KEY (module_id) REFERENCES modules(module_id)
    ON DELETE SET NULL,
  INDEX idx_practice_module_id (module_id)
) ENGINE=InnoDB;

CREATE TABLE exam_slot_requests (
  request_id INT PRIMARY KEY,
  exam_id INT NOT NULL,
  slot_id INT NULL,

  CONSTRAINT fk_exam_slot_request
    FOREIGN KEY (request_id) REFERENCES slot_requests(request_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_exam_slot_exam
    FOREIGN KEY (exam_id) REFERENCES exams(exam_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_exam_slot_requests_slot
    FOREIGN KEY (slot_id) REFERENCES exam_time_slots(slot_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 7) Study materials
-- ------------------------------------------------------------
CREATE TABLE material_types (
  material_type_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE study_materials (
  material_id INT AUTO_INCREMENT PRIMARY KEY,
  module_id INT NOT NULL,
  uploaded_by INT NOT NULL,
  material_type_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  file_url VARCHAR(500) NULL,
  external_url VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_materials_module
    FOREIGN KEY (module_id) REFERENCES modules(module_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_materials_uploader
    FOREIGN KEY (uploaded_by) REFERENCES lecturers(lecturer_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_materials_type
    FOREIGN KEY (material_type_id) REFERENCES material_types(material_type_id)
    ON DELETE RESTRICT,

  INDEX idx_materials_module (module_id),
  INDEX idx_materials_uploader (uploaded_by),
  INDEX idx_materials_type (material_type_id),
  INDEX idx_materials_active (is_active),
  INDEX idx_materials_created (created_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 8) Submission + evaluation workflow
-- ------------------------------------------------------------
CREATE TABLE submissions (
  submission_id INT AUTO_INCREMENT PRIMARY KEY,
  student_user_id INT NOT NULL,
  exam_id INT NOT NULL,
  allocation_id INT NULL,
  submission_type ENUM('PRACTICE','EXAM') NOT NULL,
  publish_mode ENUM('AUTO','LECTURER') NOT NULL,
  attempt_number INT NOT NULL DEFAULT 1,
  case_description TEXT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP NULL,
  published_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_sub_student
    FOREIGN KEY (student_user_id) REFERENCES students(student_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_sub_exam
    FOREIGN KEY (exam_id) REFERENCES exams(exam_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_sub_allocation
    FOREIGN KEY (allocation_id) REFERENCES slot_allocations(allocation_id)
    ON DELETE SET NULL,
  CONSTRAINT fk_sub_published_by
    FOREIGN KEY (published_by) REFERENCES lecturers(lecturer_id)
    ON DELETE SET NULL,

  UNIQUE KEY uq_student_exam_attempt (student_user_id, exam_id, attempt_number),

  INDEX idx_sub_student (student_user_id),
  INDEX idx_sub_exam (exam_id),
  INDEX idx_sub_type (submission_type),
  INDEX idx_sub_published_at (published_at)
) ENGINE=InnoDB;

CREATE TABLE submission_files (
  file_id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size_bytes BIGINT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_subfile_submission
    FOREIGN KEY (submission_id) REFERENCES submissions(submission_id)
    ON DELETE CASCADE,

  INDEX idx_subfile_submission (submission_id)
) ENGINE=InnoDB;

CREATE TABLE api_evaluations (
  api_evaluation_id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL UNIQUE,
  api_status ENUM('SUCCESS','FAILED') NOT NULL DEFAULT 'SUCCESS',
  api_score DECIMAL(5,2) NULL,
  confidence DECIMAL(5,2) NULL,
  smooth_outline_status ENUM('Ideal','Acceptable','Needs Improvement','Unacceptable') NULL,
  flat_floor_status ENUM('Ideal','Acceptable','Needs Improvement','Unacceptable') NULL,
  depth_status ENUM('Ideal','Acceptable','Needs Improvement','Unacceptable') NULL,
  undercut_status ENUM('Ideal','Acceptable','Needs Improvement','Unacceptable') NULL,
  raw_response_json JSON NULL,
  evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_api_eval_submission
    FOREIGN KEY (submission_id) REFERENCES submissions(submission_id)
    ON DELETE CASCADE,

  INDEX idx_api_eval_status (api_status),
  INDEX idx_api_eval_time (evaluated_at)
) ENGINE=InnoDB;

CREATE TABLE lecturer_reviews (
  review_id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL UNIQUE,
  lecturer_user_id INT NOT NULL,
  final_grade DECIMAL(5,2) NOT NULL,
  lecturer_feedback TEXT NULL,
  decision ENUM('PASS','FAIL','RETAKE') NOT NULL,
  override_reason TEXT NULL,
  reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_review_submission
    FOREIGN KEY (submission_id) REFERENCES submissions(submission_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_review_lecturer
    FOREIGN KEY (lecturer_user_id) REFERENCES lecturers(lecturer_id)
    ON DELETE CASCADE,

  INDEX idx_review_lecturer (lecturer_user_id),
  INDEX idx_review_time (reviewed_at)
) ENGINE=InnoDB;

CREATE TABLE final_results (
  result_id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL UNIQUE,
  final_grade DECIMAL(5,2) NOT NULL,
  final_feedback TEXT NULL,
  pass_fail ENUM('PASS','FAIL') NOT NULL,
  published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_by INT NULL,

  CONSTRAINT fk_result_submission
    FOREIGN KEY (submission_id) REFERENCES submissions(submission_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_result_publisher
    FOREIGN KEY (published_by) REFERENCES lecturers(lecturer_id)
    ON DELETE SET NULL,

  INDEX idx_results_published_at (published_at),
  INDEX idx_results_passfail (pass_fail)
) ENGINE=InnoDB;

CREATE TABLE retake_requests (
  retake_id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  student_user_id INT NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_by INT NULL,
  decided_at TIMESTAMP NULL,
  decision_reason VARCHAR(255) NULL,

  CONSTRAINT fk_retake_submission
    FOREIGN KEY (submission_id) REFERENCES submissions(submission_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_retake_student
    FOREIGN KEY (student_user_id) REFERENCES students(student_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_retake_decider
    FOREIGN KEY (decided_by) REFERENCES lecturers(lecturer_id)
    ON DELETE SET NULL,

  INDEX idx_retake_status (status),
  INDEX idx_retake_student (student_user_id),
  INDEX idx_retake_requested (requested_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 9) Notifications + email outbox
-- ------------------------------------------------------------
CREATE TABLE notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  recipient_role ENUM('student','lecturer','admin') NOT NULL,
  recipient_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  notification_type ENUM(
    'exam',
    'material',
    'slot_request',
    'slot_approval',
    'slot_rejection',
    'submission',
    'evaluation',
    'result',
    'system'
  ) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  related_entity_type VARCHAR(50) NULL,
  related_entity_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_notifications_recipient (recipient_role, recipient_id),
  INDEX idx_notifications_read (is_read),
  INDEX idx_notifications_created (created_at),
  INDEX idx_notifications_type (notification_type)
) ENGINE=InnoDB;

CREATE TABLE email_outbox (
  email_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('PENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL,

  INDEX idx_email_status (status),
  INDEX idx_email_created (created_at),
  INDEX idx_email_to (to_email)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 10) Logs
-- ------------------------------------------------------------
CREATE TABLE audit_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id INT NULL,
  description TEXT NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_audit_action (action),
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_actor (actor_user_id)
) ENGINE=InnoDB;

CREATE TABLE api_logs (
  api_log_id INT AUTO_INCREMENT PRIMARY KEY,
  endpoint VARCHAR(255) NULL,
  method VARCHAR(10) NULL,
  status_code INT NULL,
  response_time_ms INT NULL,
  error_message TEXT NULL,
  user_id INT NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_api_logs_created (created_at),
  INDEX idx_api_logs_status (status_code),
  INDEX idx_api_logs_endpoint (endpoint)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Seed data
-- ------------------------------------------------------------
INSERT INTO departments (department_name) VALUES
('Basic Sciences'),
('Community Dental Health'),
('Oral Medicine & Periodontology'),
('Oral & Maxillofacial Surgery'),
('Oral Pathology'),
('Prosthetic Dentistry'),
('Restorative Dentistry');

INSERT INTO admins (email, password_hash, first_name, last_name, must_change_password, is_active)
VALUES
('reshmamohammed@icloud.com', '$2b$10$REPLACE_WITH_REAL_HASH', 'Reshma', 'Muhammed', TRUE, TRUE);

INSERT INTO lecturers (email, password_hash, first_name, last_name, staff_id, department_id, must_change_password, is_active)
SELECT 'lecturer1@dentanet.lk', '$2b$10$REPLACE_WITH_REAL_HASH', 'Nimal', 'Perera', 'LEC/001', d.department_id, TRUE, TRUE
FROM departments d
WHERE d.department_name = 'Restorative Dentistry'
LIMIT 1;

INSERT INTO students (email, password_hash, first_name, last_name, registration_number, department_id, is_active)
SELECT 'student1@dentanet.lk', '$2b$10$REPLACE_WITH_REAL_HASH', 'Kumadi', 'Silva', 'DENT/2023/001', d.department_id, TRUE
FROM departments d
WHERE d.department_name = 'Restorative Dentistry'
LIMIT 1;

INSERT INTO lab_machines (machine_code, lab_number, status) VALUES
('M1', 'Lab 001', 'ready'),
('M2', 'Lab 001', 'ready'),
('M3', 'Lab 002', 'maintenance'),
('M4', 'Lab 002', 'ready');

INSERT INTO material_types (name) VALUES
('PDF'),
('YouTube'),
('Video'),
('External Link'),
('Document'),
('Other');

INSERT INTO modules (module_code, module_name, description, created_by)
SELECT
  'CAVITY101',
  'Cavity Preparation',
  'Core cavity preparation practical module.',
  l.lecturer_id
FROM lecturers l
WHERE l.email = 'lecturer1@dentanet.lk'
LIMIT 1;

INSERT INTO exams (
  module_id,
  exam_name,
  description,
  exam_date,
  start_time,
  end_time,
  max_attempts,
  passing_grade,
  status,
  created_by
)
SELECT
  m.module_id,
  'Cavity Practical Exam',
  'Core practical cavity examination.',
  '2026-03-30',
  '14:00:00',
  '17:30:00',
  2,
  50.00,
  'SCHEDULED',
  l.lecturer_id
FROM modules m
JOIN lecturers l ON l.email = 'lecturer1@dentanet.lk'
WHERE m.module_code = 'CAVITY101'
LIMIT 1;

INSERT INTO study_materials (
  module_id,
  uploaded_by,
  material_type_id,
  title,
  file_url,
  external_url
)
SELECT
  m.module_id,
  l.lecturer_id,
  mt.material_type_id,
  'Cavity Preparation Demo',
  NULL,
  'https://www.youtube.com/watch?v=example123'
FROM modules m
JOIN lecturers l ON l.email = 'lecturer1@dentanet.lk'
JOIN material_types mt ON mt.name = 'YouTube'
WHERE m.module_code = 'CAVITY101'
LIMIT 1;

INSERT INTO study_materials (
  module_id,
  uploaded_by,
  material_type_id,
  title,
  file_url,
  external_url
)
SELECT
  m.module_id,
  l.lecturer_id,
  mt.material_type_id,
  'Cavity Prep Guidelines (PDF)',
  '/uploads/materials/cavity-guidelines.pdf',
  NULL
FROM modules m
JOIN lecturers l ON l.email = 'lecturer1@dentanet.lk'
JOIN material_types mt ON mt.name = 'PDF'
WHERE m.module_code = 'CAVITY101'
LIMIT 1;

INSERT INTO exam_time_slots (exam_id, slot_date, start_time, end_time, max_machines, is_active, created_by)
SELECT exam_id, '2026-03-30', '14:00:00', '15:00:00', 10, TRUE, 1
FROM exams
WHERE exam_name = 'Cavity Practical Exam'
LIMIT 1;

INSERT INTO exam_time_slots (exam_id, slot_date, start_time, end_time, max_machines, is_active, created_by)
SELECT exam_id, '2026-03-30', '15:00:00', '16:00:00', 10, TRUE, 1
FROM exams
WHERE exam_name = 'Cavity Practical Exam'
LIMIT 1;

INSERT INTO exam_time_slots (exam_id, slot_date, start_time, end_time, max_machines, is_active, created_by)
SELECT exam_id, '2026-03-30', '16:00:00', '17:00:00', 10, TRUE, 1
FROM exams
WHERE exam_name = 'Cavity Practical Exam'
LIMIT 1;

INSERT INTO exam_time_slots (exam_id, slot_date, start_time, end_time, max_machines, is_active, created_by)
SELECT exam_id, '2026-03-30', '17:00:00', '17:30:00', 10, TRUE, 1
FROM exams
WHERE exam_name = 'Cavity Practical Exam'
LIMIT 1;

SET FOREIGN_KEY_CHECKS = 1;

DROP TABLE IF EXISTS api_evaluations;
DROP TABLE IF EXISTS submission_files;
DROP TABLE IF EXISTS lecturer_reviews;
DROP TABLE IF EXISTS final_results;
DROP TABLE IF EXISTS retake_requests;
DROP TABLE IF EXISTS submissions;

CREATE TABLE submissions (
  submission_id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  student_id INT NOT NULL,
  submission_type ENUM('PRACTICE','EXAM') NOT NULL,
  attempt_number INT NOT NULL,
  comments TEXT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_submissions_request
    FOREIGN KEY (request_id)
    REFERENCES slot_requests(request_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_submissions_student
    FOREIGN KEY (student_id)
    REFERENCES students(student_id)
    ON DELETE CASCADE,

  UNIQUE KEY uq_submission_attempt (request_id, attempt_number)
) ENGINE=InnoDB;

CREATE TABLE submission_files (
  file_id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_type VARCHAR(50) NULL,
  file_size_bytes BIGINT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_submission_files_submission
    FOREIGN KEY (submission_id)
    REFERENCES submissions(submission_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE api_evaluations (
  api_evaluation_id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL UNIQUE,

  api_status ENUM('SUCCESS','FAILED') NOT NULL DEFAULT 'SUCCESS',
  api_score DECIMAL(5,2) NULL,
  confidence DECIMAL(5,2) NULL,

  smooth_outline_status ENUM('Ideal','Acceptable','Needs Improvement','Unacceptable') NULL,
  flat_floor_status ENUM('Ideal','Acceptable','Needs Improvement','Unacceptable') NULL,
  depth_status ENUM('Ideal','Acceptable','Needs Improvement','Unacceptable') NULL,
  undercut_status ENUM('Ideal','Acceptable','Needs Improvement','Unacceptable') NULL,

  evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_api_eval_submission
    FOREIGN KEY (submission_id)
    REFERENCES submissions(submission_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE lecturer_reviews (
  review_id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL UNIQUE,
  lecturer_id INT NOT NULL,

  final_grade DECIMAL(5,2) NOT NULL,
  lecturer_feedback TEXT NULL,
  decision ENUM('PASS','FAIL','RETAKE') NOT NULL,

  override_reason TEXT NULL,
  reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_review_submission
    FOREIGN KEY (submission_id)
    REFERENCES submissions(submission_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_review_lecturer
    FOREIGN KEY (lecturer_id)
    REFERENCES lecturers(lecturer_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE final_results (
  result_id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL UNIQUE,

  final_grade DECIMAL(5,2) NOT NULL,
  final_feedback TEXT NULL,
  pass_fail ENUM('PASS','FAIL') NOT NULL,

  published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_by INT NULL,

  CONSTRAINT fk_result_submission
    FOREIGN KEY (submission_id)
    REFERENCES submissions(submission_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_result_publisher
    FOREIGN KEY (published_by)
    REFERENCES lecturers(lecturer_id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE retake_requests (
  retake_id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  student_id INT NOT NULL,

  status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  decided_by INT NULL,
  decided_at TIMESTAMP NULL,
  decision_reason VARCHAR(255) NULL,

  CONSTRAINT fk_retake_submission
    FOREIGN KEY (submission_id)
    REFERENCES submissions(submission_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_retake_student
    FOREIGN KEY (student_id)
    REFERENCES students(student_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_retake_decider
    FOREIGN KEY (decided_by)
    REFERENCES lecturers(lecturer_id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

USE dentanet_lms3;

SET FOREIGN_KEY_CHECKS = 0;


-- 3) Add student study materials table
-- ------------------------------------------------------------
CREATE TABLE student_study_materials (
  student_material_id INT AUTO_INCREMENT PRIMARY KEY,
  module_id INT NOT NULL,
  uploaded_by_student_id INT NOT NULL,
  material_type_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  file_url VARCHAR(500) NULL,
  external_url VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_student_materials_module
    FOREIGN KEY (module_id) REFERENCES modules(module_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_student_materials_student
    FOREIGN KEY (uploaded_by_student_id) REFERENCES students(student_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_student_materials_type
    FOREIGN KEY (material_type_id) REFERENCES material_types(material_type_id)
    ON DELETE RESTRICT,

  INDEX idx_student_materials_module (module_id),
  INDEX idx_student_materials_student (uploaded_by_student_id),
  INDEX idx_student_materials_type (material_type_id),
  INDEX idx_student_materials_active (is_active),
  INDEX idx_student_materials_created (created_at)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

USE dentanet_lms;

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- Module lecturers
-- ------------------------------------------------------------
CREATE TABLE module_lecturers (
  module_lecturer_id INT AUTO_INCREMENT PRIMARY KEY,
  module_id INT NOT NULL,
  lecturer_id INT NOT NULL,
  enrolled_by_admin_id INT NULL,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT fk_module_lecturers_module
    FOREIGN KEY (module_id) REFERENCES modules(module_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_module_lecturers_lecturer
    FOREIGN KEY (lecturer_id) REFERENCES lecturers(lecturer_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_module_lecturers_admin
    FOREIGN KEY (enrolled_by_admin_id) REFERENCES admins(admin_id)
    ON DELETE SET NULL,

  UNIQUE KEY uq_module_lecturer (module_id, lecturer_id),

  INDEX idx_module_lecturers_module (module_id),
  INDEX idx_module_lecturers_lecturer (lecturer_id),
  INDEX idx_module_lecturers_active (is_active)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Module students
-- ------------------------------------------------------------
CREATE TABLE module_students (
  module_student_id INT AUTO_INCREMENT PRIMARY KEY,
  module_id INT NOT NULL,
  student_id INT NOT NULL,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT fk_module_students_module
    FOREIGN KEY (module_id) REFERENCES modules(module_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_module_students_student
    FOREIGN KEY (student_id) REFERENCES students(student_id)
    ON DELETE CASCADE,

  UNIQUE KEY uq_module_student (module_id, student_id),

  INDEX idx_module_students_module (module_id),
  INDEX idx_module_students_student (student_id),
  INDEX idx_module_students_active (is_active)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE modules
ADD COLUMN module_image_url VARCHAR(500) NULL AFTER description;

ALTER TABLE module_students
DROP COLUMN module_student_id;

ALTER TABLE module_lecturers
DROP COLUMN module_lecturer_id;

