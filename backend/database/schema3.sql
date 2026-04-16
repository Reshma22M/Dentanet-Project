-- DentaNet LMS schema3.sql (live schema snapshot)
-- Generated: 2026-04-16T19:00:45.285Z
-- Database: dentanet_lms

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `dentanet_lms`;
USE `dentanet_lms`;

-- ----------------------------
-- Table structure for `admins`
-- ----------------------------
DROP TABLE IF EXISTS `admins`;
CREATE TABLE `admins` (
  `admin_id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `must_change_password` tinyint(1) NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `profile_image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`admin_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `api_evaluations`
-- ----------------------------
DROP TABLE IF EXISTS `api_evaluations`;
CREATE TABLE `api_evaluations` (
  `api_evaluation_id` int NOT NULL AUTO_INCREMENT,
  `submission_id` int NOT NULL,
  `api_status` enum('SUCCESS','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SUCCESS',
  `api_score` decimal(5,2) DEFAULT NULL,
  `confidence` decimal(5,2) DEFAULT NULL,
  `smooth_outline_status` enum('acceptable','non-acceptable') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `flat_floor_status` enum('acceptable','non-acceptable') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `depth_status` enum('acceptable','non-acceptable') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `undercut_status` enum('acceptable','non-acceptable') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evaluated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`api_evaluation_id`),
  UNIQUE KEY `submission_id` (`submission_id`),
  CONSTRAINT `fk_api_eval_submission` FOREIGN KEY (`submission_id`) REFERENCES `submissions` (`submission_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `departments`
-- ----------------------------
DROP TABLE IF EXISTS `departments`;
CREATE TABLE `departments` (
  `department_id` int NOT NULL AUTO_INCREMENT,
  `department_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`department_id`),
  UNIQUE KEY `department_name` (`department_name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `exam_slot_requests`
-- ----------------------------
DROP TABLE IF EXISTS `exam_slot_requests`;
CREATE TABLE `exam_slot_requests` (
  `request_id` int NOT NULL,
  `exam_id` int NOT NULL,
  `slot_id` int DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  KEY `fk_exam_slot_exam` (`exam_id`),
  KEY `fk_exam_slot_requests_slot` (`slot_id`),
  CONSTRAINT `fk_exam_slot_exam` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`exam_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exam_slot_request` FOREIGN KEY (`request_id`) REFERENCES `slot_requests` (`request_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exam_slot_requests_slot` FOREIGN KEY (`slot_id`) REFERENCES `exam_time_slots` (`slot_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `exam_time_slots`
-- ----------------------------
DROP TABLE IF EXISTS `exam_time_slots`;
CREATE TABLE `exam_time_slots` (
  `slot_id` int NOT NULL AUTO_INCREMENT,
  `exam_id` int NOT NULL,
  `slot_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `max_machines` int NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`slot_id`),
  KEY `fk_exam_time_slots_admin` (`created_by`),
  KEY `idx_exam_slots_exam` (`exam_id`),
  KEY `idx_exam_slots_date` (`slot_date`),
  KEY `idx_exam_slots_active` (`is_active`),
  CONSTRAINT `fk_exam_time_slots_admin` FOREIGN KEY (`created_by`) REFERENCES `admins` (`admin_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_exam_time_slots_exam` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`exam_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `exams`
-- ----------------------------
DROP TABLE IF EXISTS `exams`;
CREATE TABLE `exams` (
  `exam_id` int NOT NULL AUTO_INCREMENT,
  `module_id` int NOT NULL,
  `exam_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `exam_date` date DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `max_attempts` int NOT NULL DEFAULT '1',
  `passing_grade` decimal(5,2) DEFAULT NULL,
  `status` enum('DRAFT','SCHEDULED','OPEN','CLOSED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `created_by` int NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`exam_id`),
  KEY `idx_exams_module` (`module_id`),
  KEY `idx_exams_active` (`is_active`),
  KEY `fk_exams_created_by` (`created_by`),
  CONSTRAINT `fk_exams_created_by` FOREIGN KEY (`created_by`) REFERENCES `lecturers` (`lecturer_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exams_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `final_results`
-- ----------------------------
DROP TABLE IF EXISTS `final_results`;
CREATE TABLE `final_results` (
  `result_id` int NOT NULL AUTO_INCREMENT,
  `submission_id` int NOT NULL,
  `final_grade` decimal(5,2) NOT NULL,
  `final_feedback` text COLLATE utf8mb4_unicode_ci,
  `pass_fail` enum('PASS','FAIL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `published_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `published_by` int DEFAULT NULL,
  PRIMARY KEY (`result_id`),
  UNIQUE KEY `submission_id` (`submission_id`),
  KEY `fk_result_publisher` (`published_by`),
  CONSTRAINT `fk_result_publisher` FOREIGN KEY (`published_by`) REFERENCES `lecturers` (`lecturer_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_result_submission` FOREIGN KEY (`submission_id`) REFERENCES `submissions` (`submission_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `lab_machines`
-- ----------------------------
DROP TABLE IF EXISTS `lab_machines`;
CREATE TABLE `lab_machines` (
  `machine_id` int NOT NULL AUTO_INCREMENT,
  `machine_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lab_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ready','maintenance','unavailable') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ready',
  `last_maintenance_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`machine_id`),
  UNIQUE KEY `machine_code` (`machine_code`),
  KEY `idx_machine_status` (`status`),
  KEY `idx_machine_lab` (`lab_number`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `lecturer_reviews`
-- ----------------------------
DROP TABLE IF EXISTS `lecturer_reviews`;
CREATE TABLE `lecturer_reviews` (
  `review_id` int NOT NULL AUTO_INCREMENT,
  `submission_id` int NOT NULL,
  `lecturer_id` int NOT NULL,
  `final_grade` decimal(5,2) NOT NULL,
  `lecturer_feedback` text COLLATE utf8mb4_unicode_ci,
  `decision` enum('PASS','FAIL','RETAKE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `override_reason` text COLLATE utf8mb4_unicode_ci,
  `reviewed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`review_id`),
  UNIQUE KEY `submission_id` (`submission_id`),
  KEY `fk_review_lecturer` (`lecturer_id`),
  CONSTRAINT `fk_review_lecturer` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers` (`lecturer_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_review_submission` FOREIGN KEY (`submission_id`) REFERENCES `submissions` (`submission_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `lecturers`
-- ----------------------------
DROP TABLE IF EXISTS `lecturers`;
CREATE TABLE `lecturers` (
  `lecturer_id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `staff_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department_id` int NOT NULL,
  `must_change_password` tinyint(1) NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `profile_image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`lecturer_id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `staff_id` (`staff_id`),
  KEY `idx_lecturer_dept` (`department_id`),
  CONSTRAINT `fk_lecturers_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `material_types`
-- ----------------------------
DROP TABLE IF EXISTS `material_types`;
CREATE TABLE `material_types` (
  `material_type_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`material_type_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `module_lecturers`
-- ----------------------------
DROP TABLE IF EXISTS `module_lecturers`;
CREATE TABLE `module_lecturers` (
  `module_id` int NOT NULL,
  `lecturer_id` int NOT NULL,
  `enrolled_by_admin_id` int DEFAULT NULL,
  `enrolled_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  UNIQUE KEY `uq_module_lecturer` (`module_id`,`lecturer_id`),
  KEY `fk_module_lecturers_admin` (`enrolled_by_admin_id`),
  KEY `idx_module_lecturers_module` (`module_id`),
  KEY `idx_module_lecturers_lecturer` (`lecturer_id`),
  KEY `idx_module_lecturers_active` (`is_active`),
  CONSTRAINT `fk_module_lecturers_admin` FOREIGN KEY (`enrolled_by_admin_id`) REFERENCES `admins` (`admin_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_module_lecturers_lecturer` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers` (`lecturer_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_module_lecturers_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `module_students`
-- ----------------------------
DROP TABLE IF EXISTS `module_students`;
CREATE TABLE `module_students` (
  `module_id` int NOT NULL,
  `student_id` int NOT NULL,
  `enrolled_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  UNIQUE KEY `uq_module_student` (`module_id`,`student_id`),
  KEY `idx_module_students_module` (`module_id`),
  KEY `idx_module_students_student` (`student_id`),
  KEY `idx_module_students_active` (`is_active`),
  CONSTRAINT `fk_module_students_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_module_students_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `modules`
-- ----------------------------
DROP TABLE IF EXISTS `modules`;
CREATE TABLE `modules` (
  `module_id` int NOT NULL AUTO_INCREMENT,
  `module_code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `module_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `module_image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`module_id`),
  UNIQUE KEY `module_code` (`module_code`),
  UNIQUE KEY `uq_modules_module_code` (`module_code`),
  KEY `idx_modules_active` (`is_active`),
  KEY `fk_modules_created_by` (`created_by`),
  CONSTRAINT `fk_modules_created_by` FOREIGN KEY (`created_by`) REFERENCES `admins` (`admin_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `notifications`
-- ----------------------------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `recipient_role` enum('student','lecturer','admin') COLLATE utf8mb4_unicode_ci NOT NULL,
  `recipient_id` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `notification_type` enum('exam','material','slot_request','slot_approval','slot_rejection','submission','evaluation','result','system') COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `related_entity_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_entity_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `idx_notifications_recipient` (`recipient_role`,`recipient_id`),
  KEY `idx_notifications_read` (`is_read`),
  KEY `idx_notifications_created` (`created_at`),
  KEY `idx_notifications_type` (`notification_type`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `password_reset_tokens`
-- ----------------------------
DROP TABLE IF EXISTS `password_reset_tokens`;
CREATE TABLE `password_reset_tokens` (
  `token_id` int NOT NULL AUTO_INCREMENT,
  `account_type` enum('admin','student','lecturer') COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_id` int NOT NULL,
  `otp_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` timestamp NOT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `is_used` tinyint(1) NOT NULL DEFAULT '0',
  `attempts` int NOT NULL DEFAULT '0',
  `last_sent_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_id`),
  KEY `idx_prt_account` (`account_type`,`account_id`),
  KEY `idx_prt_email` (`email`),
  KEY `idx_prt_expires` (`expires_at`),
  KEY `idx_prt_used` (`is_used`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `practice_slot_requests`
-- ----------------------------
DROP TABLE IF EXISTS `practice_slot_requests`;
CREATE TABLE `practice_slot_requests` (
  `request_id` int NOT NULL,
  `purpose` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `module_id` int DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  KEY `idx_practice_module_id` (`module_id`),
  CONSTRAINT `fk_practice_module_id` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_practice_slot_request` FOREIGN KEY (`request_id`) REFERENCES `slot_requests` (`request_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `retake_requests`
-- ----------------------------
DROP TABLE IF EXISTS `retake_requests`;
CREATE TABLE `retake_requests` (
  `retake_id` int NOT NULL AUTO_INCREMENT,
  `submission_id` int NOT NULL,
  `student_id` int NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `requested_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `decided_by` int DEFAULT NULL,
  `decided_at` timestamp NULL DEFAULT NULL,
  `decision_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`retake_id`),
  KEY `fk_retake_submission` (`submission_id`),
  KEY `fk_retake_student` (`student_id`),
  KEY `fk_retake_decider` (`decided_by`),
  CONSTRAINT `fk_retake_decider` FOREIGN KEY (`decided_by`) REFERENCES `lecturers` (`lecturer_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_retake_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_retake_submission` FOREIGN KEY (`submission_id`) REFERENCES `submissions` (`submission_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `slot_allocations`
-- ----------------------------
DROP TABLE IF EXISTS `slot_allocations`;
CREATE TABLE `slot_allocations` (
  `allocation_id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `machine_id` int NOT NULL,
  `approved_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`allocation_id`),
  UNIQUE KEY `request_id` (`request_id`),
  KEY `idx_alloc_machine` (`machine_id`),
  KEY `idx_alloc_approved_by` (`approved_by`),
  KEY `idx_alloc_approved_at` (`approved_at`),
  CONSTRAINT `fk_alloc_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `admins` (`admin_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_alloc_machine` FOREIGN KEY (`machine_id`) REFERENCES `lab_machines` (`machine_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_alloc_request` FOREIGN KEY (`request_id`) REFERENCES `slot_requests` (`request_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `slot_requests`
-- ----------------------------
DROP TABLE IF EXISTS `slot_requests`;
CREATE TABLE `slot_requests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `student_user_id` int NOT NULL,
  `slot_type` enum('PRACTICE','EXAM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `booking_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `status` enum('PENDING','APPROVED','DENIED','CANCELLED','COMPLETED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  KEY `idx_slotreq_student` (`student_user_id`),
  KEY `idx_slotreq_date` (`booking_date`),
  KEY `idx_slotreq_type` (`slot_type`),
  KEY `idx_slotreq_status` (`status`),
  CONSTRAINT `fk_slotreq_student` FOREIGN KEY (`student_user_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `student_study_materials`
-- ----------------------------
DROP TABLE IF EXISTS `student_study_materials`;
CREATE TABLE `student_study_materials` (
  `student_material_id` int NOT NULL AUTO_INCREMENT,
  `module_id` int NOT NULL,
  `uploaded_by_student_id` int NOT NULL,
  `material_type_id` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `file_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_material_id`),
  KEY `idx_student_materials_module` (`module_id`),
  KEY `idx_student_materials_student` (`uploaded_by_student_id`),
  KEY `idx_student_materials_type` (`material_type_id`),
  KEY `idx_student_materials_created` (`created_at`),
  CONSTRAINT `fk_student_materials_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_student_materials_student` FOREIGN KEY (`uploaded_by_student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_student_materials_type` FOREIGN KEY (`material_type_id`) REFERENCES `material_types` (`material_type_id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `students`
-- ----------------------------
DROP TABLE IF EXISTS `students`;
CREATE TABLE `students` (
  `student_id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `registration_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_id` int NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `profile_image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`student_id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `registration_number` (`registration_number`),
  KEY `idx_student_dept` (`department_id`),
  CONSTRAINT `fk_students_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_reg_strict` CHECK (regexp_like(`registration_number`,_utf8mb4'^DENT/(20[0-2][0-9]|2030)/(00[1-9]|0[1-9][0-9]|1[0-9][0-9]|200)$'))
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `study_materials`
-- ----------------------------
DROP TABLE IF EXISTS `study_materials`;
CREATE TABLE `study_materials` (
  `material_id` int NOT NULL AUTO_INCREMENT,
  `module_id` int NOT NULL,
  `uploaded_by` int NOT NULL,
  `material_type_id` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`material_id`),
  KEY `idx_materials_module` (`module_id`),
  KEY `idx_materials_uploader` (`uploaded_by`),
  KEY `idx_materials_type` (`material_type_id`),
  KEY `idx_materials_active` (`is_active`),
  KEY `idx_materials_created` (`created_at`),
  CONSTRAINT `fk_materials_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_materials_type` FOREIGN KEY (`material_type_id`) REFERENCES `material_types` (`material_type_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_materials_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `lecturers` (`lecturer_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `submission_files`
-- ----------------------------
DROP TABLE IF EXISTS `submission_files`;
CREATE TABLE `submission_files` (
  `file_id` int NOT NULL AUTO_INCREMENT,
  `submission_id` int NOT NULL,
  `file_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size_bytes` bigint DEFAULT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`file_id`),
  KEY `fk_submission_files_submission` (`submission_id`),
  CONSTRAINT `fk_submission_files_submission` FOREIGN KEY (`submission_id`) REFERENCES `submissions` (`submission_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for `submissions`
-- ----------------------------
DROP TABLE IF EXISTS `submissions`;
CREATE TABLE `submissions` (
  `submission_id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `student_id` int NOT NULL,
  `submission_type` enum('PRACTICE','EXAM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempt_number` int NOT NULL,
  `comments` text COLLATE utf8mb4_unicode_ci,
  `submitted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`submission_id`),
  UNIQUE KEY `uq_submission_attempt` (`request_id`,`attempt_number`),
  KEY `fk_submissions_student` (`student_id`),
  CONSTRAINT `fk_submissions_request` FOREIGN KEY (`request_id`) REFERENCES `slot_requests` (`request_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_submissions_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
