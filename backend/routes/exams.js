const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken, authorizeRole } = require("../middleware/auth");
const { notifyAdmins } = require("../services/notifications");
const { sendEmail, hasSmtpConfig } = require("../services/email");

// --------------------------------------------------
// Helpers
// --------------------------------------------------
async function getExamById(examId) {
  const [rows] = await promisePool.query(
    `
    SELECT
      e.exam_id,
      e.module_id,
      e.exam_name,
      e.description,
      e.exam_date,
      e.start_time,
      e.end_time,
      e.max_attempts,
      e.passing_grade,
      e.status,
      e.created_by,
      e.is_active,
      e.created_at,
      e.updated_at,
      m.module_code,
      m.module_name
    FROM exams e
    LEFT JOIN modules m
      ON e.module_id = m.module_id
    WHERE e.exam_id = ?
    LIMIT 1
    `,
    [examId]
  );

  return rows[0] || null;
}

async function getModuleById(moduleId) {
  const [rows] = await promisePool.query(
    `
    SELECT
      module_id,
      module_code,
      module_name,
      created_by,
      is_active
    FROM modules
    WHERE module_id = ? AND is_active = TRUE
    LIMIT 1
    `,
    [moduleId]
  );

  return rows[0] || null;
}

async function isLecturerEnrolledInModule(moduleId, lecturerId) {
  const [rows] = await promisePool.query(
    `
    SELECT lecturer_id
    FROM module_lecturers
    WHERE module_id = ?
      AND lecturer_id = ?
      AND is_active = TRUE
    LIMIT 1
    `,
    [moduleId, lecturerId]
  );

  return rows.length > 0;
}

function isValidStatus(status) {
  return ["DRAFT", "SCHEDULED", "OPEN", "CLOSED"].includes(status);
}

function buildExamDateTime(examDate, endTime, startTime) {
  if (!examDate) return null;

  const timeValue = endTime || startTime || "23:59:59";
  const parsed = new Date(`${examDate}T${String(timeValue).slice(0, 8)}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapExamVisibility(exam) {
  const examEndDate = buildExamDateTime(exam.exam_date, exam.end_time, exam.start_time);
  const now = new Date();
  const retentionCutoff = examEndDate ? new Date(examEndDate) : null;

  if (retentionCutoff) {
    retentionCutoff.setMonth(retentionCutoff.getMonth() + 3);
  }

  return {
    ...exam,
    exam_has_passed: !!examEndDate && now > examEndDate,
    retention_expires_at: retentionCutoff ? retentionCutoff.toISOString() : null,
    retention_expired: !!retentionCutoff && now > retentionCutoff
  };
}

function formatTimeForMail(timeValue) {
  if (!timeValue) return "-";
  const [h, m] = String(timeValue).slice(0, 5).split(":");
  const hour = Number(h || 0);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${suffix}`;
}

function formatDateForMail(dateValue) {
  if (!dateValue) return "TBA";
  const parsed = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(dateValue);
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

// --------------------------------------------------
// GET all exams
// Optional query params:
//   module_id
//   status
// --------------------------------------------------
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { module_id, status } = req.query;

    let query = `
      SELECT
        e.exam_id,
        e.module_id,
        e.exam_name,
        e.description,
        e.exam_date,
        e.start_time,
        e.end_time,
        e.max_attempts,
        e.passing_grade,
        e.status,
        e.created_by,
        e.is_active,
        e.created_at,
        e.updated_at,
        m.module_code,
        m.module_name
      FROM exams e
      LEFT JOIN modules m
        ON e.module_id = m.module_id
      WHERE e.is_active = TRUE
    `;

    const params = [];

    if (module_id) {
      query += " AND e.module_id = ?";
      params.push(Number(module_id));
    }

    if (status) {
      query += " AND e.status = ?";
      params.push(String(status).toUpperCase());
    }

    query += `
      ORDER BY
        CASE WHEN e.exam_date IS NULL THEN 1 ELSE 0 END,
        e.exam_date ASC,
        e.start_time ASC,
        e.created_at DESC
    `;

    const [rows] = await promisePool.query(query, params);
    const exams = rows
      .map(mapExamVisibility)
      .filter(exam => !exam.retention_expired);

    return res.json({
      ok: true,
      exams,
    });
  } catch (error) {
    console.error("Get exams error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to fetch exams",
    });
  }
});

// --------------------------------------------------
// GET one exam by id
// --------------------------------------------------
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const examRecord = await getExamById(Number(req.params.id));
    const exam = examRecord ? mapExamVisibility(examRecord) : null;

    if (!exam || exam.is_active === 0 || exam.is_active === false) {
      return res.status(404).json({
        ok: false,
        error: "Exam not found",
      });
    }

    if (exam.retention_expired) {
      return res.status(404).json({
        ok: false,
        error: "Exam is no longer available",
      });
    }

    return res.json({
      ok: true,
      exam,
    });
  } catch (error) {
    console.error("Get exam by id error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to fetch exam",
    });
  }
});

// --------------------------------------------------
// CREATE exam (lecturer only)
// Lecturer must be enrolled in the module.
// --------------------------------------------------
router.post("/", authenticateToken, authorizeRole("lecturer"), async (req, res) => {
  try {
    const {
      module_id,
      exam_name,
      description,
      exam_date,
      start_time,
      end_time,
      max_attempts,
      passing_grade,
      status,
    } = req.body;

    if (!module_id || !exam_name) {
      return res.status(400).json({
        ok: false,
        error: "module_id and exam_name are required",
      });
    }

    const numericModuleId = Number(module_id);
    const numericLecturerId = Number(req.user.id);

    const module = await getModuleById(numericModuleId);

    if (!module) {
      return res.status(400).json({
        ok: false,
        error: "Invalid module",
      });
    }

    const enrolled = await isLecturerEnrolledInModule(numericModuleId, numericLecturerId);

    if (!enrolled) {
      return res.status(403).json({
        ok: false,
        error: "You can only create exams under modules you are enrolled in",
      });
    }

    const finalStatus = status ? String(status).toUpperCase() : "DRAFT";

    if (!isValidStatus(finalStatus)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid status",
      });
    }

    const finalExamName = String(exam_name).trim();
    const finalDescription = description ? String(description).trim() : null;
    const finalExamDate = exam_date || null;
    const finalStartTime = start_time || null;
    const finalEndTime = end_time || null;
    const finalMaxAttempts = max_attempts ? Number(max_attempts) : 1;
    const finalPassingGrade =
      passing_grade !== undefined && passing_grade !== null && passing_grade !== ""
        ? Number(passing_grade)
        : null;

    if (finalMaxAttempts < 1) {
      return res.status(400).json({
        ok: false,
        error: "max_attempts must be at least 1",
      });
    }

    if (finalPassingGrade !== null && (finalPassingGrade < 0 || finalPassingGrade > 100)) {
      return res.status(400).json({
        ok: false,
        error: "passing_grade must be between 0 and 100",
      });
    }

    if ((finalStartTime && !finalEndTime) || (!finalStartTime && finalEndTime)) {
      return res.status(400).json({
        ok: false,
        error: "Both start_time and end_time should be provided together",
      });
    }

    const [result] = await promisePool.query(
      `
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
        created_by,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
      `,
      [
        numericModuleId,
        finalExamName,
        finalDescription,
        finalExamDate,
        finalStartTime,
        finalEndTime,
        finalMaxAttempts,
        finalPassingGrade,
        finalStatus,
        numericLecturerId,
      ]
    );

    const exam = await getExamById(result.insertId);

    await notifyAdmins({
      title: "New exam scheduled",
      message: `${req.user.first_name || "A lecturer"} scheduled "${finalExamName}" and it may need admin slot allocation.`,
      notificationType: "exam",
      relatedEntityType: "exam",
      relatedEntityId: result.insertId
    });

    try {
      const [enrolledStudents] = await promisePool.query(
        `
        SELECT s.student_id, s.email, s.first_name, s.last_name
        FROM module_students ms
        JOIN students s
          ON s.student_id = ms.student_id
        WHERE ms.module_id = ?
          AND ms.is_active = TRUE
          AND s.is_active = TRUE
        `,
        [numericModuleId]
      );

      if (enrolledStudents.length) {
        await Promise.allSettled(
          enrolledStudents.map((student) =>
            promisePool.query(
              `
              INSERT INTO notifications
              (
                recipient_role,
                recipient_id,
                title,
                message,
                notification_type,
                related_entity_type,
                related_entity_id
              )
              VALUES ('student', ?, ?, ?, 'exam', 'exam', ?)
              `,
              [
                student.student_id,
                "Exam scheduled",
                `A new exam "${finalExamName}" was scheduled for your module. Check LMS and book your lab slot when slots are available.`,
                result.insertId
              ]
            )
          )
        );

        if (hasSmtpConfig()) {
          const examDateText = formatDateForMail(finalExamDate);
          const examTimeText = finalStartTime && finalEndTime
            ? `${formatTimeForMail(finalStartTime)} - ${formatTimeForMail(finalEndTime)}`
            : "TBA";

          await Promise.allSettled(
            enrolledStudents
              .filter((student) => student.email)
              .map((student) =>
                sendEmail({
                  to: student.email,
                  subject: `DentaNet: New Exam Scheduled (${module.module_code})`,
                  html: `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                      <h2>New Exam Scheduled</h2>
                      <p>Hello ${student.first_name || "Student"},</p>
                      <p>A new practical exam has been scheduled for your registered module.</p>
                      <p><strong>Module:</strong> ${module.module_code} - ${module.module_name}</p>
                      <p><strong>Exam:</strong> ${finalExamName}</p>
                      <p><strong>Date:</strong> ${examDateText}</p>
                      <p><strong>Time Window:</strong> ${examTimeText}</p>
                      <p>Please complete your practical exam within this scheduled time window.</p>
                      <p>Please log in to DentaNet LMS and book your lab slot when available.</p>
                    </div>
                  `,
                  text: `A new exam "${finalExamName}" was scheduled for ${module.module_code} (${module.module_name}) on ${examDateText}. Time window: ${examTimeText}. Please complete your practical exam within this scheduled window and log in to DentaNet LMS to book your lab slot when available.`
                })
              )
          );
        }
      }
    } catch (studentNotifyError) {
      console.error("Failed to notify enrolled students for scheduled exam:", studentNotifyError);
    }

    return res.status(201).json({
      ok: true,
      message: "Exam created successfully",
      exam,
    });
  } catch (error) {
    console.error("Create exam error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to create exam",
    });
  }
});

// --------------------------------------------------
// UPDATE exam (lecturer only)
// Lecturer can only update exams created by them.
// If moving exam to another module, lecturer must be enrolled there too.
// --------------------------------------------------
router.put("/:id", authenticateToken, authorizeRole("lecturer"), async (req, res) => {
  try {
    const examId = Number(req.params.id);

    const existing = await getExamById(examId);

    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: "Exam not found",
      });
    }

    if (Number(existing.created_by) !== Number(req.user.id)) {
      return res.status(403).json({
        ok: false,
        error: "You can only edit exams created by you",
      });
    }

    const {
      module_id,
      exam_name,
      description,
      exam_date,
      start_time,
      end_time,
      max_attempts,
      passing_grade,
      status,
      is_active,
    } = req.body;

    const finalModuleId =
      module_id !== undefined && module_id !== ""
        ? Number(module_id)
        : Number(existing.module_id);

    const module = await getModuleById(finalModuleId);

    if (!module) {
      return res.status(400).json({
        ok: false,
        error: "Invalid module",
      });
    }

    const enrolled = await isLecturerEnrolledInModule(finalModuleId, Number(req.user.id));

    if (!enrolled) {
      return res.status(403).json({
        ok: false,
        error: "You can only assign exams to modules you are enrolled in",
      });
    }

    const finalStatus = status ? String(status).toUpperCase() : existing.status;

    if (!isValidStatus(finalStatus)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid status",
      });
    }

    const finalExamName =
      exam_name !== undefined && String(exam_name).trim()
        ? String(exam_name).trim()
        : existing.exam_name;

    const finalDescription =
      description !== undefined
        ? (description ? String(description).trim() : null)
        : existing.description;

    const finalExamDate = exam_date !== undefined ? (exam_date || null) : existing.exam_date;
    const finalStartTime = start_time !== undefined ? (start_time || null) : existing.start_time;
    const finalEndTime = end_time !== undefined ? (end_time || null) : existing.end_time;

    const finalMaxAttempts =
      max_attempts !== undefined && max_attempts !== ""
        ? Number(max_attempts)
        : Number(existing.max_attempts);

    const finalPassingGrade =
      passing_grade !== undefined
        ? (passing_grade === "" || passing_grade === null ? null : Number(passing_grade))
        : existing.passing_grade;

    if (finalMaxAttempts < 1) {
      return res.status(400).json({
        ok: false,
        error: "max_attempts must be at least 1",
      });
    }

    if (finalPassingGrade !== null && (finalPassingGrade < 0 || finalPassingGrade > 100)) {
      return res.status(400).json({
        ok: false,
        error: "passing_grade must be between 0 and 100",
      });
    }

    if ((finalStartTime && !finalEndTime) || (!finalStartTime && finalEndTime)) {
      return res.status(400).json({
        ok: false,
        error: "Both start_time and end_time should be provided together",
      });
    }

    await promisePool.query(
      `
      UPDATE exams
      SET
        module_id = ?,
        exam_name = ?,
        description = ?,
        exam_date = ?,
        start_time = ?,
        end_time = ?,
        max_attempts = ?,
        passing_grade = ?,
        status = ?,
        is_active = ?
      WHERE exam_id = ?
      `,
      [
        finalModuleId,
        finalExamName,
        finalDescription,
        finalExamDate,
        finalStartTime,
        finalEndTime,
        finalMaxAttempts,
        finalPassingGrade,
        finalStatus,
        is_active !== undefined ? is_active : existing.is_active,
        examId,
      ]
    );

    const exam = await getExamById(examId);

    return res.json({
      ok: true,
      message: "Exam updated successfully",
      exam,
    });
  } catch (error) {
    console.error("Update exam error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to update exam",
    });
  }
});

// --------------------------------------------------
// SOFT DELETE exam (lecturer only)
// --------------------------------------------------
router.delete("/:id", authenticateToken, authorizeRole("lecturer"), async (req, res) => {
  try {
    const examId = Number(req.params.id);

    const existing = await getExamById(examId);

    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: "Exam not found",
      });
    }

    if (Number(existing.created_by) !== Number(req.user.id)) {
      return res.status(403).json({
        ok: false,
        error: "You can only delete exams created by you",
      });
    }

    await promisePool.query(
      `
      UPDATE exams
      SET is_active = FALSE
      WHERE exam_id = ?
      `,
      [examId]
    );

    return res.json({
      ok: true,
      message: "Exam deleted successfully",
    });
  } catch (error) {
    console.error("Delete exam error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to delete exam",
    });
  }
});

module.exports = router;
