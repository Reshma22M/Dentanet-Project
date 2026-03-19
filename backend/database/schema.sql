-- Create Database
CREATE DATABASE IF NOT EXISTS dentanet_lms
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE dentanet_lms;

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE departments (
  department_id INT AUTO_INCREMENT PRIMARY KEY,
  department_name VARCHAR(150) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE admins (
  admin_id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- account control
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
  -- account control
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_students_department
    FOREIGN KEY (department_id)
    REFERENCES departments(department_id)
    ON DELETE RESTRICT,

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
  -- account control
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_lecturers_department
    FOREIGN KEY (department_id)
    REFERENCES departments(department_id)
    ON DELETE RESTRICT,

  INDEX idx_lecturer_dept (department_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3) Password reset OTP (store HASHED OTP)
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

  -- rate limiting + auditing
  attempts INT NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_prt_account (account_type, account_id),
  INDEX idx_prt_email (email),
  INDEX idx_prt_expires (expires_at),
  INDEX idx_prt_used (is_used)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4) Lab Machines + Slot workflow (Request -> Allocation)
-- ------------------------------------------------------------
CREATE TABLE lab_machines (
  machine_id INT AUTO_INCREMENT PRIMARY KEY,
  machine_code VARCHAR(20) NOT NULL UNIQUE, -- e.g., M5 or M-005
  lab_number VARCHAR(20) NOT NULL,

  status ENUM('ready','maintenance','unavailable') NOT NULL DEFAULT 'ready',
  last_maintenance_date DATE NULL,
  notes TEXT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_machine_status (status),
  INDEX idx_machine_lab (lab_number)
) ENGINE=InnoDB;

-- Slot request (student)
CREATE TABLE slot_requests (
  request_id INT AUTO_INCREMENT PRIMARY KEY,
  student_user_id INT NOT NULL,

  slot_type ENUM('PRACTICE','EXAM') NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,

  purpose VARCHAR(255) NULL,

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

-- Slot allocation (admin assigns machine) 
-- FIX: removed allocation_status to avoid duplicated/contradicting status.
-- Allocation row exists only when request is APPROVED.
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
-- 5) Future-ready academic structure: Modules + Exams
-- ------------------------------------------------------------
CREATE TABLE modules (
  module_id INT AUTO_INCREMENT PRIMARY KEY,
  module_code VARCHAR(30) NOT NULL UNIQUE,
  module_name VARCHAR(255) NOT NULL,
  description TEXT NULL,

  created_by INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_modules_created_by
    FOREIGN KEY (created_by) REFERENCES admins(admin_id)
    ON DELETE SET NULL,

  INDEX idx_modules_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE exams (
  exam_id INT AUTO_INCREMENT PRIMARY KEY,
  module_id INT NOT NULL,

  exam_name VARCHAR(255) NOT NULL,
  exam_type ENUM('PRACTICAL') NOT NULL DEFAULT 'PRACTICAL',

  max_attempts INT NOT NULL DEFAULT 1,
  passing_grade DECIMAL(5,2) NULL,

  created_by INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_exams_module
    FOREIGN KEY (module_id) REFERENCES modules(module_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_exams_created_by
    FOREIGN KEY (created_by) REFERENCES admins(admin_id)
    ON DELETE SET NULL,

  INDEX idx_exams_module (module_id),
  INDEX idx_exams_active (is_active)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 6) Study materials (MUST feature)
-- ------------------------------------------------------------
CREATE TABLE study_materials (
  material_id INT AUTO_INCREMENT PRIMARY KEY,

  module_id INT NULL,
  uploaded_by INT NOT NULL,

  title VARCHAR(255) NOT NULL,
  description TEXT NULL,

  material_type ENUM('pdf','youtube','video','link','document','other') NOT NULL,

  file_url VARCHAR(500) NULL,
  external_url VARCHAR(500) NULL,
  thumbnail_url VARCHAR(500) NULL,

  category VARCHAR(100) NULL,
  duration VARCHAR(20) NULL,
  file_size_mb DECIMAL(10,2) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_materials_module
    FOREIGN KEY (module_id) REFERENCES modules(module_id)
    ON DELETE SET NULL,
  CONSTRAINT fk_materials_uploader
    FOREIGN KEY (uploaded_by) REFERENCES lecturers(lecturer_id)
    ON DELETE CASCADE,

  INDEX idx_materials_module (module_id),
  INDEX idx_materials_uploader (uploaded_by),
  INDEX idx_materials_type (material_type),
  INDEX idx_materials_active (is_active),
  INDEX idx_materials_created (created_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 7) Submissions (unified) with clearer status values
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

  smooth_outline_status ENUM('acceptable','non-acceptable') NULL,
  flat_floor_status     ENUM('acceptable','non-acceptable') NULL,
  depth_status          ENUM('acceptable','non-acceptable') NULL,
  undercut_status       ENUM('acceptable','non-acceptable') NULL,

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
-- 8) Notifications + Email outbox
-- ------------------------------------------------------------
CREATE TABLE notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,

  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,

  notification_type ENUM('evaluation','booking','material','system','announcement','approval') NOT NULL,

  is_read BOOLEAN NOT NULL DEFAULT FALSE,

  related_entity_type VARCHAR(50) NULL,
  related_entity_id INT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- notifications.user_id may reference any account type; keep flexible (no FK)

  INDEX idx_notif_user (user_id),
  INDEX idx_notif_read (is_read),
  INDEX idx_notif_created (created_at)
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

  -- email_outbox.user_id may reference any account type; keep flexible (no FK)

  INDEX idx_email_status (status),
  INDEX idx_email_created (created_at),
  INDEX idx_email_to (to_email)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 9) Logs
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

  -- audit_logs.actor_user_id: no FK to keep actor flexible across account tables

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

  -- api_logs.user_id: no FK (flexible)

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

-- Sample admin (APPROVED) - replace hash in real use
INSERT INTO admins (email, password_hash, first_name, last_name, must_change_password, is_active)
VALUES
('admin@dentanet.lk', '$2b$10$REPLACE_WITH_REAL_HASH', 'System', 'Admin', TRUE, TRUE);

-- Sample lecturer (active)
INSERT INTO lecturers (email, password_hash, first_name, last_name, staff_id, department_id, must_change_password, is_active)
SELECT 'lecturer1@dentanet.lk', '$2b$10$REPLACE_WITH_REAL_HASH', 'Nimal', 'Perera', 'LEC/001', d.department_id, TRUE, TRUE
FROM departments d
WHERE d.department_name = 'Restorative Dentistry'
LIMIT 1;

-- Sample student (active)
INSERT INTO students (email, password_hash, first_name, last_name, registration_number, department_id, is_active)
SELECT 'student1@dentanet.lk', '$2b$10$REPLACE_WITH_REAL_HASH', 'Kumadi', 'Silva', 'DENT/2023/001', d.department_id, TRUE
FROM departments d
WHERE d.department_name = 'Restorative Dentistry'
LIMIT 1;

-- Lab machines
INSERT INTO lab_machines (machine_code, lab_number, status) VALUES
('M1', 'Lab 001', 'ready'),
('M2', 'Lab 001', 'ready'),
('M3', 'Lab 002', 'maintenance'),
('M4', 'Lab 002', 'ready');

-- Base module + exam
INSERT INTO modules (module_code, module_name, description, created_by)
SELECT 'CAVITY101', 'Cavity Preparation', 'Core cavity preparation practical module.', a.admin_id
FROM admins a WHERE a.email='admin@dentanet.lk' LIMIT 1;

INSERT INTO exams (module_id, exam_name, max_attempts, passing_grade, created_by)
SELECT m.module_id, 'Cavity Practical Exam', 2, 50.00, a.admin_id
FROM modules m
JOIN admins a ON a.email='admin@dentanet.lk'
WHERE m.module_code='CAVITY101'
LIMIT 1;

-- Sample materials
INSERT INTO study_materials (module_id, uploaded_by, title, description, material_type, external_url, category)
SELECT m.module_id, l.lecturer_id, 'Cavity Prep Demo - YouTube', 'Watch the demo and follow steps.', 'youtube',
       'https://www.youtube.com/watch?v=REPLACE_ME', 'Demo'
FROM modules m
JOIN lecturers l ON l.email = 'lecturer1@dentanet.lk'
WHERE m.module_code='CAVITY101'
LIMIT 1;

INSERT INTO study_materials (module_id, uploaded_by, title, description, material_type, file_url, category, file_size_mb)
SELECT m.module_id, l.lecturer_id, 'Cavity Prep Guidelines (PDF)', 'Official guideline document.', 'pdf',
       '/uploads/materials/cavity-guidelines.pdf', 'Guidelines', 2.40
FROM modules m
JOIN lecturers l ON l.email = 'lecturer1@dentanet.lk'
WHERE m.module_code='CAVITY101'
LIMIT 1;

-- Enforce registration number format on `students` table
ALTER TABLE students
ADD CONSTRAINT chk_reg_strict
CHECK (
  registration_number REGEXP '^DENT/(20[0-2][0-9]|2030)/(00[1-9]|0[1-9][0-9]|1[0-9][0-9]|200)$'
);

ALTER TABLE students ADD COLUMN profile_image_url VARCHAR(500);
ALTER TABLE lecturers ADD COLUMN profile_image_url VARCHAR(500);
ALTER TABLE admins ADD COLUMN profile_image_url VARCHAR(500);