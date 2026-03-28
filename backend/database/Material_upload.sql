USE dentanet_lms;
SELECT * FROM modules;
SELECT * FROM exams;
SELECT * FROM study_materials;

SET SQL_SAFE_UPDATES = 0;

DELETE FROM study_materials;
DELETE FROM exams;
DELETE FROM modules;

ALTER TABLE modules
DROP FOREIGN KEY fk_modules_created_by;

ALTER TABLE modules
MODIFY created_by INT NOT NULL;

ALTER TABLE modules
ADD CONSTRAINT fk_modules_created_by
FOREIGN KEY (created_by)
REFERENCES lecturers(lecturer_id)
ON DELETE CASCADE;

SHOW CREATE TABLE modules;

INSERT INTO modules (module_code, module_name, description, created_by)
SELECT
  'CAVITY101',
  'Cavity Preparation',
  'Core cavity preparation practical module.',
  l.lecturer_id
FROM lecturers l
WHERE l.email = 'lecturer1@dentanet.lk'
LIMIT 1;

ALTER TABLE exams
DROP FOREIGN KEY fk_exams_created_by;

ALTER TABLE exams
MODIFY created_by INT NOT NULL;

ALTER TABLE exams
ADD CONSTRAINT fk_exams_created_by
FOREIGN KEY (created_by)
REFERENCES lecturers(lecturer_id)
ON DELETE CASCADE;

SHOW CREATE TABLE exams;

INSERT INTO exams (
  module_id,
  exam_name,
  max_attempts,
  passing_grade,
  created_by
)
SELECT
  m.module_id,
  'Cavity Practical Exam',
  2,
  50.00,
  l.lecturer_id
FROM modules m
JOIN lecturers l
  ON l.email = 'lecturer1@dentanet.lk'
WHERE m.module_code = 'CAVITY101'
LIMIT 1;
