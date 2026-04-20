const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { evaluateImages } = require("../services/ai_evaluator");
const { createNotification, notifyAdmins } = require("../services/notifications");
const { sendEmail, hasSmtpConfig } = require("../services/email");

// -------------------------------------------------------
// Upload config
// -------------------------------------------------------
const uploadDir = path.join(__dirname, "..", "uploads", "submissions");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, "submission-" + unique + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/jpg", "image/png"];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPG and PNG files are allowed"));
        }
    }
});

function normalizeError(error, fallback) {
    if (error && typeof error.message === "string") return error.message;
    return fallback;
}

async function canLecturerAccessSubmission(submissionId, lecturerId) {
    const [rows] = await promisePool.query(`
        SELECT s.submission_id
        FROM submissions s
        JOIN slot_requests sr
          ON s.request_id = sr.request_id
        JOIN exam_slot_requests esr
          ON esr.request_id = sr.request_id
        JOIN exams e
          ON esr.exam_id = e.exam_id
        WHERE s.submission_id = ?
          AND s.submission_type = 'EXAM'
          AND (
            e.created_by = ?
            OR EXISTS (
              SELECT 1
              FROM module_lecturers ml
              WHERE ml.module_id = e.module_id
                AND ml.lecturer_id = ?
                AND ml.is_active = TRUE
            )
          )
        LIMIT 1
    `, [submissionId, lecturerId, lecturerId]);

    return rows.length > 0;
}

function tryParseJson(value) {
    if (!value) return null;

    if (typeof value === "object") {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
}

function mapAiStatusForDb(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "ideal" || normalized === "acceptable") {
        return "acceptable";
    }
    if (normalized === "needs improvement" || normalized === "unacceptable") {
        return "non-acceptable";
    }
    return null;
}

function toNullableDate(value) {
    if (!value) return null;
    const text = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    return text;
}

function toBatchYearFromRegistration(registrationNumber) {
    const match = String(registrationNumber || "").match(/\/(20\d{2})\//);
    return match ? Number(match[1]) : null;
}

function toSafeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

let retakeStudentColumnCache = null;
async function getRetakeStudentColumn() {
    if (retakeStudentColumnCache) return retakeStudentColumnCache;

    const [columns] = await promisePool.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'retake_requests'
          AND COLUMN_NAME IN ('student_user_id', 'student_id')
        LIMIT 1
    `);

    retakeStudentColumnCache = columns[0]?.COLUMN_NAME || "student_user_id";
    return retakeStudentColumnCache;
}

function toLocalDateTime(dateValue, endTimeValue, fallbackTimeValue = "23:59:59") {
    if (!dateValue) return null;

    const text = String(dateValue).trim();
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    let year;
    let month;
    let day;

    if (isoMatch) {
        year = Number(isoMatch[1]);
        month = Number(isoMatch[2]);
        day = Number(isoMatch[3]);
    } else {
        const parsedDate = new Date(text);
        if (Number.isNaN(parsedDate.getTime())) return null;
        year = parsedDate.getFullYear();
        month = parsedDate.getMonth() + 1;
        day = parsedDate.getDate();
    }

    const timeValue = endTimeValue || fallbackTimeValue;
    const [hh, mm, ss] = String(timeValue).slice(0, 8).split(":").map((v) => Number(v || 0));
    const parsed = new Date(year, month - 1, day, hh, mm, ss || 0, 0);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function reduceAttempts(rows, mode) {
    const attemptMode = String(mode || "last").toLowerCase();
    if (attemptMode === "all") return rows;

    const grouped = new Map();
    for (const row of rows) {
        const key = `${row.student_id}:${row.exam_id}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    }

    const picked = [];
    for (const groupRows of grouped.values()) {
        const sortedByAttempt = [...groupRows].sort((a, b) => toSafeNumber(a.attempt_number) - toSafeNumber(b.attempt_number));

        if (attemptMode === "first") {
            picked.push(sortedByAttempt[0]);
            continue;
        }

        if (attemptMode === "best") {
            const sortedByBest = [...groupRows].sort((a, b) => {
                const gradeDiff = toSafeNumber(b.final_grade ?? b.lecturer_grade) - toSafeNumber(a.final_grade ?? a.lecturer_grade);
                if (gradeDiff !== 0) return gradeDiff;
                return toSafeNumber(b.attempt_number) - toSafeNumber(a.attempt_number);
            });
            picked.push(sortedByBest[0]);
            continue;
        }

        picked.push(sortedByAttempt[sortedByAttempt.length - 1]);
    }

    return picked;
}


// =======================================================
// COMMON STUDENT SUBMISSION HUB DATA
// =======================================================
router.get("/student/dashboard-data", authenticateToken, async (req, res) => {
    try {
        const studentId = req.user.id;

        const [practiceSessions] = await promisePool.query(`
            SELECT
                sr.request_id,
                sr.student_user_id AS student_id,
                sr.booking_date,
                sr.start_time,
                sr.end_time,
                sr.status AS slot_status,
                psr.module_id,
                psr.purpose,

                latest.submission_id,
                latest.attempt_number,
                latest.submitted_at,

                ae.api_score,
                ae.api_status,

                fr.final_grade,
                fr.final_feedback,
                fr.pass_fail,
                fr.published_at

            FROM practice_slot_requests psr
            JOIN slot_requests sr
                ON psr.request_id = sr.request_id

            LEFT JOIN (
                SELECT s1.*
                FROM submissions s1
                INNER JOIN (
                    SELECT request_id, student_id, submission_type, MAX(attempt_number) AS latest_attempt
                    FROM submissions
                    WHERE submission_type = 'PRACTICE'
                    GROUP BY request_id, student_id, submission_type
                ) latest_pick
                    ON latest_pick.request_id = s1.request_id
                   AND latest_pick.student_id = s1.student_id
                   AND latest_pick.submission_type = s1.submission_type
                   AND latest_pick.latest_attempt = s1.attempt_number
            ) latest
                ON latest.request_id = sr.request_id
               AND latest.student_id = sr.student_user_id
               AND latest.submission_type = 'PRACTICE'

            LEFT JOIN api_evaluations ae
                ON ae.submission_id = latest.submission_id

            LEFT JOIN final_results fr
                ON fr.submission_id = latest.submission_id

            WHERE sr.student_user_id = ?
            ORDER BY sr.booking_date DESC, sr.start_time DESC
        `, [studentId]);

        const [examSessions] = await promisePool.query(`
            SELECT
                sr.request_id,
                sr.student_user_id AS student_id,
                sr.booking_date,
                sr.start_time,
                sr.end_time,
                sr.status AS slot_status,

                e.exam_id,
                e.exam_name,
                e.description,
                e.status AS exam_status,

                ets.slot_date,
                ets.start_time AS exam_start_time,
                ets.end_time AS exam_end_time,

                latest.submission_id,
                latest.attempt_number,
                latest.submitted_at,

                lr.final_grade,
                lr.decision,
                lr.lecturer_feedback,

                fr.final_grade AS published_grade,
                fr.final_feedback,
                fr.pass_fail,
                fr.published_at

            FROM exam_slot_requests esr
            JOIN slot_requests sr
                ON esr.request_id = sr.request_id
            JOIN exam_time_slots ets
                ON esr.slot_id = ets.slot_id
            JOIN exams e
                ON esr.exam_id = e.exam_id

            LEFT JOIN (
                SELECT s1.*
                FROM submissions s1
                INNER JOIN (
                    SELECT request_id, student_id, submission_type, MAX(attempt_number) AS latest_attempt
                    FROM submissions
                    WHERE submission_type = 'EXAM'
                    GROUP BY request_id, student_id, submission_type
                ) latest_pick
                    ON latest_pick.request_id = s1.request_id
                   AND latest_pick.student_id = s1.student_id
                   AND latest_pick.submission_type = s1.submission_type
                   AND latest_pick.latest_attempt = s1.attempt_number
            ) latest
                ON latest.request_id = sr.request_id
               AND latest.student_id = sr.student_user_id
               AND latest.submission_type = 'EXAM'

            LEFT JOIN lecturer_reviews lr
                ON lr.submission_id = latest.submission_id

            LEFT JOIN final_results fr
                ON fr.submission_id = latest.submission_id

            WHERE sr.student_user_id = ?
            ORDER BY ets.slot_date DESC, ets.start_time DESC
        `, [studentId]);

        return res.json({
            ok: true,
            practiceSessions,
            examSessions
        });
    } catch (error) {
        console.error("Load student dashboard data error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to load student submission dashboard data"
        });
    }
});

// =======================================================
// MODULE-AWARE SUBMISSION HUB DATA
// =======================================================
router.get("/student/module/:module_id", authenticateToken, async (req, res) => {
    try {
        const studentId = req.user.id;
        const moduleId = req.params.module_id;

        if (req.user.role !== "student") {
            return res.status(403).json({ ok: false, error: "Only students can access this endpoint" });
        }

        // Exam sessions scoped to this module
        const [examSessions] = await promisePool.query(`
            SELECT
                sr.request_id,
                sr.student_user_id AS student_id,
                sr.booking_date,
                sr.start_time,
                sr.end_time,
                sr.status AS slot_status,

                e.exam_id,
                e.exam_name,
                e.description,
                e.status AS exam_status,
                e.module_id,

                m.module_code,
                m.module_name,

                ets.slot_date,
                ets.start_time AS exam_start_time,
                ets.end_time AS exam_end_time,

                latest.submission_id,
                latest.attempt_number,
                latest.submitted_at,

                lr.final_grade,
                lr.decision,
                lr.lecturer_feedback,

                fr.final_grade AS published_grade,
                fr.final_feedback,
                fr.pass_fail

            FROM exam_slot_requests esr
            JOIN slot_requests sr
                ON esr.request_id = sr.request_id
            JOIN exam_time_slots ets
                ON esr.slot_id = ets.slot_id
            JOIN exams e
                ON esr.exam_id = e.exam_id
            JOIN modules m
                ON e.module_id = m.module_id

            LEFT JOIN (
                SELECT s1.*
                FROM submissions s1
                INNER JOIN (
                    SELECT request_id, student_id, submission_type, MAX(attempt_number) AS latest_attempt
                    FROM submissions
                    WHERE submission_type = 'EXAM'
                    GROUP BY request_id, student_id, submission_type
                ) latest_pick
                    ON latest_pick.request_id = s1.request_id
                   AND latest_pick.student_id = s1.student_id
                   AND latest_pick.submission_type = s1.submission_type
                   AND latest_pick.latest_attempt = s1.attempt_number
            ) latest
                ON latest.request_id = sr.request_id
               AND latest.student_id = sr.student_user_id
               AND latest.submission_type = 'EXAM'

            LEFT JOIN lecturer_reviews lr
                ON lr.submission_id = latest.submission_id

            LEFT JOIN final_results fr
                ON fr.submission_id = latest.submission_id

            WHERE sr.student_user_id = ?
              AND e.module_id = ?
            ORDER BY ets.slot_date DESC, ets.start_time DESC
        `, [studentId, moduleId]);

        // Practice sessions scoped by optional exam linkage to this module
        const [practiceSessions] = await promisePool.query(`
            SELECT
                sr.request_id,
                sr.student_user_id AS student_id,
                sr.booking_date,
                sr.start_time,
                sr.end_time,
                sr.status AS slot_status,
                psr.module_id,
                psr.purpose,

                latest.submission_id,
                latest.attempt_number,
                latest.submitted_at,

                ae.api_score,
                ae.api_status,

                fr.final_grade,
                fr.final_feedback,
                fr.pass_fail,
                fr.published_at

            FROM practice_slot_requests psr
            JOIN slot_requests sr
                ON psr.request_id = sr.request_id
            LEFT JOIN exam_slot_requests esr
                ON esr.request_id = sr.request_id
            LEFT JOIN exams e
                ON e.exam_id = esr.exam_id

            LEFT JOIN (
                SELECT s1.*
                FROM submissions s1
                INNER JOIN (
                    SELECT request_id, student_id, submission_type, MAX(attempt_number) AS latest_attempt
                    FROM submissions
                    WHERE submission_type = 'PRACTICE'
                    GROUP BY request_id, student_id, submission_type
                ) latest_pick
                    ON latest_pick.request_id = s1.request_id
                   AND latest_pick.student_id = s1.student_id
                   AND latest_pick.submission_type = s1.submission_type
                   AND latest_pick.latest_attempt = s1.attempt_number
            ) latest
                ON latest.request_id = sr.request_id
               AND latest.student_id = sr.student_user_id
               AND latest.submission_type = 'PRACTICE'

            LEFT JOIN api_evaluations ae
                ON ae.submission_id = latest.submission_id

            LEFT JOIN final_results fr
                ON fr.submission_id = latest.submission_id

            WHERE sr.student_user_id = ?
              AND (e.module_id = ? OR psr.module_id = ?)
            ORDER BY sr.booking_date DESC, sr.start_time DESC
        `, [studentId, moduleId, moduleId]);

        // Fetch module info
        const [moduleRows] = await promisePool.query(`
            SELECT module_id, module_code, module_name, description
            FROM modules
            WHERE module_id = ?
            LIMIT 1
        `, [moduleId]);

        if (!moduleRows.length) {
            return res.status(404).json({ ok: false, error: "Module not found" });
        }

        return res.json({
            ok: true,
            module: moduleRows[0],
            practiceSessions,
            examSessions
        });
    } catch (error) {
        console.error("Module submission hub error:", error);
        return res.status(500).json({ ok: false, error: "Failed to load module submission data" });
    }
});

// =======================================================
// GET ONE EXAM SUBMISSION PAGE
// =======================================================
router.get("/exam/:exam_id", authenticateToken, async (req, res) => {
    try {
        const studentId = req.user.id;
        const examId = req.params.exam_id;

        const [examRows] = await promisePool.query(`
            SELECT
                e.exam_id,
                e.exam_name,
                e.description,
                e.status AS exam_status,

                sr.request_id,
                sr.student_user_id AS student_id,
                sr.booking_date,
                sr.start_time,
                sr.end_time,
                sr.status AS slot_status,

                ets.slot_id,
                ets.slot_date,
                ets.start_time AS exam_start_time,
                ets.end_time AS exam_end_time,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM submissions sx
                        WHERE sx.request_id = sr.request_id
                          AND sx.student_id = sr.student_user_id
                          AND sx.submission_type = 'EXAM'
                    ) THEN 1
                    ELSE 0
                END AS has_submission_for_request
            FROM exam_slot_requests esr
            JOIN slot_requests sr
                ON esr.request_id = sr.request_id
            JOIN exam_time_slots ets
                ON esr.slot_id = ets.slot_id
            JOIN exams e
                ON esr.exam_id = e.exam_id

            WHERE sr.student_user_id = ?
              AND e.exam_id = ?
              AND sr.slot_type = 'EXAM'
              AND UPPER(COALESCE(sr.status, '')) NOT IN ('CANCELLED', 'DENIED')
            ORDER BY has_submission_for_request ASC, ets.slot_date DESC, ets.start_time DESC
            LIMIT 1
        `, [studentId, examId]);

        if (!examRows.length) {
            return res.status(404).json({
                ok: false,
                error: "No booked examination slot found for this examination"
            });
        }

        const requestId = examRows[0].request_id;

        const [historyRows] = await promisePool.query(`
            SELECT
                s.submission_id,
                s.attempt_number,
                s.comments,
                s.submitted_at,
                s.updated_at,

                lr.final_grade,
                lr.decision,
                lr.lecturer_feedback,

                fr.final_grade AS published_grade,
                fr.final_feedback,
                fr.pass_fail,
                fr.published_at

            FROM submissions s
            LEFT JOIN lecturer_reviews lr
                ON lr.submission_id = s.submission_id
            LEFT JOIN final_results fr
                ON fr.submission_id = s.submission_id
            WHERE s.request_id = ?
              AND s.student_id = ?
              AND s.submission_type = 'EXAM'
            ORDER BY s.attempt_number DESC
        `, [requestId, studentId]);

        return res.json({
            ok: true,
            mode: "EXAM",
            exam: examRows[0],
            history: historyRows
        });
    } catch (error) {
        console.error("Load exam submission page error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to load examination submission data"
        });
    }
});

// =======================================================
// GET ONE PRACTICE SUBMISSION PAGE
// =======================================================
router.get("/practice/:request_id", authenticateToken, async (req, res) => {
    try {
        const studentId = req.user.id;
        const requestId = req.params.request_id;

        const [practiceRows] = await promisePool.query(`
            SELECT
                sr.request_id,
                sr.student_user_id AS student_id,
                sr.booking_date,
                sr.start_time,
                sr.end_time,
                sr.status AS slot_status,
                psr.purpose

            FROM practice_slot_requests psr
            JOIN slot_requests sr
                ON psr.request_id = sr.request_id
            WHERE sr.request_id = ?
              AND sr.student_user_id = ?
            LIMIT 1
        `, [requestId, studentId]);

        if (!practiceRows.length) {
            return res.status(404).json({
                ok: false,
                error: "No booked practice session found"
            });
        }

        const [historyRows] = await promisePool.query(`
            SELECT
                s.submission_id,
                s.attempt_number,
                s.comments,
                s.submitted_at,
                s.updated_at,

                ae.api_score,
                ae.api_status,

                fr.final_grade,
                fr.final_feedback,
                fr.pass_fail

            FROM submissions s
            LEFT JOIN api_evaluations ae
                ON ae.submission_id = s.submission_id
            LEFT JOIN final_results fr
                ON fr.submission_id = s.submission_id
            WHERE s.request_id = ?
              AND s.student_id = ?
              AND s.submission_type = 'PRACTICE'
            ORDER BY s.attempt_number DESC
        `, [requestId, studentId]);

        return res.json({
            ok: true,
            mode: "PRACTICE",
            practice: practiceRows[0],
            history: historyRows
        });
    } catch (error) {
        console.error("Load practice submission page error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to load practice submission data"
        });
    }
});

// =======================================================
// LECTURER EXAM SUBMISSION QUEUE
// =======================================================
router.get("/lecturer/exams", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "lecturer") {
            return res.status(403).json({
                ok: false,
                error: "Only lecturers can access exam evaluation submissions"
            });
        }

        const lecturerId = req.user.id;

        const [rows] = await promisePool.query(`
            SELECT
                latest.submission_id,
                latest.request_id,
                latest.student_id,
                latest.attempt_number,
                latest.comments,
                latest.submitted_at,
                latest.updated_at,

                stu.first_name AS student_first_name,
                stu.last_name AS student_last_name,
                stu.email AS student_email,
                stu.registration_number,

                e.exam_id,
                e.exam_name,
                e.description AS exam_description,
                e.module_id,
                e.passing_grade,

                m.module_code,
                m.module_name,

                ets.slot_date,
                ets.start_time AS exam_start_time,
                ets.end_time AS exam_end_time,

                ae.api_status,
                ae.api_score,
                ae.confidence,
                ae.smooth_outline_status,
                ae.flat_floor_status,
                ae.depth_status,
                ae.undercut_status,
                ae.evaluated_at,

                lr.final_grade AS lecturer_grade,
                lr.decision,
                lr.lecturer_feedback,
                lr.override_reason,
                lr.reviewed_at,

                fr.final_grade AS published_grade,
                fr.final_feedback,
                fr.pass_fail,
                fr.published_at
            FROM (
                SELECT s1.*
                FROM submissions s1
                INNER JOIN (
                    SELECT request_id, MAX(attempt_number) AS latest_attempt
                    FROM submissions
                    WHERE submission_type = 'EXAM'
                    GROUP BY request_id
                ) latest_pick
                    ON latest_pick.request_id = s1.request_id
                   AND latest_pick.latest_attempt = s1.attempt_number
                WHERE s1.submission_type = 'EXAM'
            ) latest
            JOIN slot_requests sr
                ON sr.request_id = latest.request_id
            JOIN exam_slot_requests esr
                ON esr.request_id = sr.request_id
            JOIN exams e
                ON e.exam_id = esr.exam_id
            JOIN modules m
                ON m.module_id = e.module_id
            JOIN students stu
                ON stu.student_id = latest.student_id
            LEFT JOIN exam_time_slots ets
                ON ets.slot_id = esr.slot_id
            LEFT JOIN api_evaluations ae
                ON ae.submission_id = latest.submission_id
            LEFT JOIN lecturer_reviews lr
                ON lr.submission_id = latest.submission_id
            LEFT JOIN final_results fr
                ON fr.submission_id = latest.submission_id
            WHERE (
                e.created_by = ?
                OR EXISTS (
                    SELECT 1
                    FROM module_lecturers ml
                    WHERE ml.module_id = e.module_id
                      AND ml.lecturer_id = ?
                      AND ml.is_active = TRUE
                )
            )
            ORDER BY latest.submitted_at DESC, latest.submission_id DESC
        `, [lecturerId, lecturerId]);

        return res.json({
            ok: true,
            submissions: rows
        });
    } catch (error) {
        console.error("Load lecturer exam submissions error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to load lecturer exam submissions"
        });
    }
});

// =======================================================
// LECTURER EXAM SUBMISSION DETAIL
// =======================================================
router.get("/lecturer/exams/:submission_id", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "lecturer") {
            return res.status(403).json({
                ok: false,
                error: "Only lecturers can access exam evaluation submissions"
            });
        }

        const lecturerId = req.user.id;
        const submissionId = req.params.submission_id;

        const allowed = await canLecturerAccessSubmission(submissionId, lecturerId);

        if (!allowed) {
            return res.status(403).json({
                ok: false,
                error: "You can only access submissions for your assigned module"
            });
        }

        const [rows] = await promisePool.query(`
            SELECT
                s.submission_id,
                s.request_id,
                s.student_id,
                s.submission_type,
                s.attempt_number,
                s.comments,
                s.submitted_at,
                s.updated_at,

                stu.first_name AS student_first_name,
                stu.last_name AS student_last_name,
                stu.email AS student_email,
                stu.registration_number,
                stu.profile_image_url AS student_profile_image_url,

                e.exam_id,
                e.exam_name,
                e.description AS exam_description,
                e.module_id,
                e.passing_grade,
                e.status AS exam_status,

                m.module_code,
                m.module_name,

                ets.slot_date,
                ets.start_time AS exam_start_time,
                ets.end_time AS exam_end_time,

                ae.api_status,
                ae.api_score,
                ae.confidence,
                ae.smooth_outline_status,
                ae.flat_floor_status,
                ae.depth_status,
                ae.undercut_status,
                NULL AS raw_response_json,
                ae.evaluated_at,

                lr.final_grade AS lecturer_grade,
                lr.decision,
                lr.lecturer_feedback,
                lr.override_reason,
                lr.reviewed_at,

                fr.final_grade AS published_grade,
                fr.final_feedback,
                fr.pass_fail,
                fr.published_at
            FROM submissions s
            JOIN slot_requests sr
                ON sr.request_id = s.request_id
            JOIN exam_slot_requests esr
                ON esr.request_id = sr.request_id
            JOIN exams e
                ON e.exam_id = esr.exam_id
            JOIN modules m
                ON m.module_id = e.module_id
            JOIN students stu
                ON stu.student_id = s.student_id
            LEFT JOIN exam_time_slots ets
                ON ets.slot_id = esr.slot_id
            LEFT JOIN api_evaluations ae
                ON ae.submission_id = s.submission_id
            LEFT JOIN lecturer_reviews lr
                ON lr.submission_id = s.submission_id
            LEFT JOIN final_results fr
                ON fr.submission_id = s.submission_id
            WHERE s.submission_id = ?
              AND s.submission_type = 'EXAM'
            LIMIT 1
        `, [submissionId]);

        if (!rows.length) {
            return res.status(404).json({
                ok: false,
                error: "Exam submission not found"
            });
        }

        const [files] = await promisePool.query(`
            SELECT
                file_id,
                file_url,
                file_type,
                file_size_bytes,
                uploaded_at
            FROM submission_files
            WHERE submission_id = ?
            ORDER BY file_id ASC
        `, [submissionId]);

        const submission = {
            ...rows[0],
            raw_response_json: tryParseJson(rows[0].raw_response_json)
        };

        return res.json({
            ok: true,
            submission,
            files
        });
    } catch (error) {
        console.error("Load lecturer exam submission detail error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to load lecturer exam submission detail"
        });
    }
});

// =======================================================
// GET ONE EXAM SUBMISSION PAGE BY REQUEST (PRECISE SLOT)
// =======================================================
router.get("/exam-request/:request_id", authenticateToken, async (req, res) => {
    try {
        const studentId = req.user.id;
        const requestId = req.params.request_id;

        const [examRows] = await promisePool.query(`
            SELECT
                e.exam_id,
                e.exam_name,
                e.description,
                e.status AS exam_status,

                sr.request_id,
                sr.student_user_id AS student_id,
                sr.booking_date,
                sr.start_time,
                sr.end_time,
                sr.status AS slot_status,

                ets.slot_id,
                ets.slot_date,
                ets.start_time AS exam_start_time,
                ets.end_time AS exam_end_time,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM submissions sx
                        WHERE sx.request_id = sr.request_id
                          AND sx.student_id = sr.student_user_id
                          AND sx.submission_type = 'EXAM'
                    ) THEN 1
                    ELSE 0
                END AS has_submission_for_request
            FROM exam_slot_requests esr
            JOIN slot_requests sr
                ON esr.request_id = sr.request_id
            JOIN exam_time_slots ets
                ON esr.slot_id = ets.slot_id
            JOIN exams e
                ON esr.exam_id = e.exam_id

            WHERE sr.student_user_id = ?
              AND sr.request_id = ?
              AND sr.slot_type = 'EXAM'
            LIMIT 1
        `, [studentId, requestId]);

        if (!examRows.length) {
            return res.status(404).json({
                ok: false,
                error: "No booked examination slot found for this request"
            });
        }

        const [historyRows] = await promisePool.query(`
            SELECT
                s.submission_id,
                s.attempt_number,
                s.comments,
                s.submitted_at,
                s.updated_at,

                lr.final_grade,
                lr.decision,
                lr.lecturer_feedback,

                fr.final_grade AS published_grade,
                fr.final_feedback,
                fr.pass_fail,
                fr.published_at

            FROM submissions s
            LEFT JOIN lecturer_reviews lr
                ON lr.submission_id = s.submission_id
            LEFT JOIN final_results fr
                ON fr.submission_id = s.submission_id
            WHERE s.request_id = ?
              AND s.student_id = ?
              AND s.submission_type = 'EXAM'
            ORDER BY s.attempt_number DESC
        `, [requestId, studentId]);

        return res.json({
            ok: true,
            mode: "EXAM",
            exam: examRows[0],
            history: historyRows
        });
    } catch (error) {
        console.error("Load exam submission page by request error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to load examination submission data"
        });
    }
});

// =======================================================
// GET ONE EXAM SUBMISSION PAGE BY SLOT (PRECISE SLOT)
// =======================================================
router.get("/exam-slot/:slot_id", authenticateToken, async (req, res) => {
    try {
        const studentId = req.user.id;
        const slotId = req.params.slot_id;

        const [examRows] = await promisePool.query(`
            SELECT
                e.exam_id,
                e.exam_name,
                e.description,
                e.status AS exam_status,

                sr.request_id,
                sr.student_user_id AS student_id,
                sr.booking_date,
                sr.start_time,
                sr.end_time,
                sr.status AS slot_status,

                ets.slot_id,
                ets.slot_date,
                ets.start_time AS exam_start_time,
                ets.end_time AS exam_end_time,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM submissions sx
                        WHERE sx.request_id = sr.request_id
                          AND sx.student_id = sr.student_user_id
                          AND sx.submission_type = 'EXAM'
                    ) THEN 1
                    ELSE 0
                END AS has_submission_for_request
            FROM exam_slot_requests esr
            JOIN slot_requests sr
                ON esr.request_id = sr.request_id
            JOIN exam_time_slots ets
                ON esr.slot_id = ets.slot_id
            JOIN exams e
                ON esr.exam_id = e.exam_id

            WHERE sr.student_user_id = ?
              AND ets.slot_id = ?
              AND sr.slot_type = 'EXAM'
            ORDER BY sr.request_id DESC
            LIMIT 1
        `, [studentId, slotId]);

        if (!examRows.length) {
            return res.status(404).json({
                ok: false,
                error: "No booked examination slot found for this slot"
            });
        }

        const requestId = examRows[0].request_id;
        const [historyRows] = await promisePool.query(`
            SELECT
                s.submission_id,
                s.attempt_number,
                s.comments,
                s.submitted_at,
                s.updated_at,

                lr.final_grade,
                lr.decision,
                lr.lecturer_feedback,

                fr.final_grade AS published_grade,
                fr.final_feedback,
                fr.pass_fail,
                fr.published_at

            FROM submissions s
            LEFT JOIN lecturer_reviews lr
                ON lr.submission_id = s.submission_id
            LEFT JOIN final_results fr
                ON fr.submission_id = s.submission_id
            WHERE s.request_id = ?
              AND s.student_id = ?
              AND s.submission_type = 'EXAM'
            ORDER BY s.attempt_number DESC
        `, [requestId, studentId]);

        return res.json({
            ok: true,
            mode: "EXAM",
            exam: examRows[0],
            history: historyRows
        });
    } catch (error) {
        console.error("Load exam submission page by slot error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to load examination submission data"
        });
    }
});

// =======================================================
// LECTURER BATCH PERFORMANCE REPORT
// =======================================================
router.get("/lecturer/reports/batch-performance", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "lecturer") {
            return res.status(403).json({ ok: false, error: "Only lecturers can access reports" });
        }

        const lecturerId = req.user.id;
        const moduleId = req.query.module_id ? Number(req.query.module_id) : null;
        const batchYear = req.query.batch_year ? Number(req.query.batch_year) : null;
        const startDate = toNullableDate(req.query.start_date);
        const endDate = toNullableDate(req.query.end_date);
        const attemptMode = String(req.query.attempt_mode || "last").toLowerCase();

        const [rows] = await promisePool.query(`
            SELECT
                s.submission_id,
                s.student_id,
                s.attempt_number,
                stu.first_name,
                stu.last_name,
                stu.registration_number,
                e.exam_id,
                e.exam_name,
                e.module_id,
                m.module_code,
                m.module_name,
                fr.final_grade,
                fr.pass_fail,
                fr.published_at,
                DATE_FORMAT(fr.published_at, '%Y-%m-%d') AS published_date
            FROM submissions s
            JOIN final_results fr
                ON fr.submission_id = s.submission_id
            JOIN slot_requests sr
                ON sr.request_id = s.request_id
            JOIN exam_slot_requests esr
                ON esr.request_id = sr.request_id
            JOIN exams e
                ON e.exam_id = esr.exam_id
            JOIN modules m
                ON m.module_id = e.module_id
            JOIN students stu
                ON stu.student_id = s.student_id
            WHERE s.submission_type = 'EXAM'
              AND (
                e.created_by = ?
                OR EXISTS (
                    SELECT 1
                    FROM module_lecturers ml
                    WHERE ml.module_id = e.module_id
                      AND ml.lecturer_id = ?
                      AND ml.is_active = TRUE
                )
              )
              AND (? IS NULL OR e.module_id = ?)
              AND (? IS NULL OR DATE(fr.published_at) >= ?)
              AND (? IS NULL OR DATE(fr.published_at) <= ?)
            ORDER BY fr.published_at DESC, s.submission_id DESC
        `, [lecturerId, lecturerId, moduleId, moduleId, startDate, startDate, endDate, endDate]);

        const scopedByBatch = rows.filter((row) => {
            if (!batchYear) return true;
            return toBatchYearFromRegistration(row.registration_number) === batchYear;
        });

        const selectedRows = reduceAttempts(scopedByBatch, attemptMode);

        const totalRecords = selectedRows.length;
        const totalPass = selectedRows.filter((r) => String(r.pass_fail || "").toUpperCase() === "PASS").length;
        const avgGrade = totalRecords
            ? selectedRows.reduce((sum, row) => sum + toSafeNumber(row.final_grade), 0) / totalRecords
            : 0;

        const studentMap = new Map();
        for (const row of selectedRows) {
            const key = row.student_id;
            if (!studentMap.has(key)) {
                studentMap.set(key, {
                    student_id: row.student_id,
                    student_name: `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Student",
                    registration_number: row.registration_number,
                    batch_year: toBatchYearFromRegistration(row.registration_number),
                    submissions: 0,
                    pass_count: 0,
                    fail_count: 0,
                    total_grade: 0,
                    best_grade: null,
                    latest_grade: null
                });
            }

            const entry = studentMap.get(key);
            const grade = toSafeNumber(row.final_grade);
            entry.submissions += 1;
            entry.total_grade += grade;
            entry.latest_grade = grade;
            entry.best_grade = entry.best_grade === null ? grade : Math.max(entry.best_grade, grade);
            if (String(row.pass_fail || "").toUpperCase() === "PASS") entry.pass_count += 1;
            else entry.fail_count += 1;
        }

        const students = Array.from(studentMap.values())
            .map((entry) => ({
                ...entry,
                average_grade: entry.submissions ? Number((entry.total_grade / entry.submissions).toFixed(2)) : 0,
                best_grade: entry.best_grade === null ? null : Number(entry.best_grade.toFixed(2)),
                latest_grade: entry.latest_grade === null ? null : Number(entry.latest_grade.toFixed(2))
            }))
            .sort((a, b) => b.average_grade - a.average_grade);

        const moduleMap = new Map();
        for (const row of selectedRows) {
            const key = row.module_id;
            if (!moduleMap.has(key)) {
                moduleMap.set(key, {
                    module_id: row.module_id,
                    module_code: row.module_code,
                    module_name: row.module_name,
                    records: 0,
                    pass_count: 0,
                    grade_total: 0
                });
            }
            const entry = moduleMap.get(key);
            entry.records += 1;
            entry.grade_total += toSafeNumber(row.final_grade);
            if (String(row.pass_fail || "").toUpperCase() === "PASS") entry.pass_count += 1;
        }

        const modules = Array.from(moduleMap.values()).map((entry) => ({
            module_id: entry.module_id,
            module_code: entry.module_code,
            module_name: entry.module_name,
            records: entry.records,
            pass_rate: entry.records ? Number(((entry.pass_count / entry.records) * 100).toFixed(2)) : 0,
            average_grade: entry.records ? Number((entry.grade_total / entry.records).toFixed(2)) : 0
        })).sort((a, b) => b.records - a.records);

        const timelineMap = new Map();
        for (const row of selectedRows) {
            const dateKey = String(row.published_date || "").trim();
            if (!dateKey) continue;

            if (!timelineMap.has(dateKey)) {
                timelineMap.set(dateKey, {
                    date: dateKey,
                    records: 0,
                    pass_count: 0,
                    grade_total: 0
                });
            }

            const entry = timelineMap.get(dateKey);
            entry.records += 1;
            entry.grade_total += toSafeNumber(row.final_grade);
            if (String(row.pass_fail || "").toUpperCase() === "PASS") {
                entry.pass_count += 1;
            }
        }

        const timeline = Array.from(timelineMap.values())
            .sort((a, b) => String(a.date).localeCompare(String(b.date)))
            .map((entry) => ({
                date: entry.date,
                records: entry.records,
                pass_rate: entry.records ? Number(((entry.pass_count / entry.records) * 100).toFixed(2)) : 0,
                average_grade: entry.records ? Number((entry.grade_total / entry.records).toFixed(2)) : 0
            }));

        return res.json({
            ok: true,
            generated_at: new Date().toISOString(),
            filters: {
                module_id: moduleId,
                batch_year: batchYear,
                start_date: startDate,
                end_date: endDate,
                attempt_mode: attemptMode
            },
            summary: {
                total_records: totalRecords,
                total_students: students.length,
                pass_rate: totalRecords ? Number(((totalPass / totalRecords) * 100).toFixed(2)) : 0,
                average_grade: Number(avgGrade.toFixed(2))
            },
            students,
            modules,
            timeline
        });
    } catch (error) {
        console.error("Batch performance report error:", error);
        return res.status(500).json({ ok: false, error: "Failed to generate batch performance report" });
    }
});

// =======================================================
// LECTURER AI ACCURACY REPORT
// =======================================================
router.get("/lecturer/reports/ai-accuracy", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "lecturer") {
            return res.status(403).json({ ok: false, error: "Only lecturers can access reports" });
        }

        const lecturerId = req.user.id;
        const moduleId = req.query.module_id ? Number(req.query.module_id) : null;
        const batchYear = req.query.batch_year ? Number(req.query.batch_year) : null;
        const startDate = toNullableDate(req.query.start_date);
        const endDate = toNullableDate(req.query.end_date);
        const attemptMode = String(req.query.attempt_mode || "last").toLowerCase();
        const tolerance = Math.max(0, toSafeNumber(req.query.tolerance, 5));

        const [rows] = await promisePool.query(`
            SELECT
                s.submission_id,
                s.student_id,
                s.attempt_number,
                s.submitted_at,
                stu.first_name,
                stu.last_name,
                stu.registration_number,
                e.exam_id,
                e.exam_name,
                e.module_id,
                m.module_code,
                m.module_name,
                ae.api_score,
                ae.confidence,
                ae.smooth_outline_status,
                ae.flat_floor_status,
                ae.depth_status,
                ae.undercut_status,
                lr.final_grade AS lecturer_grade,
                lr.decision,
                lr.reviewed_at
            FROM submissions s
            JOIN api_evaluations ae
                ON ae.submission_id = s.submission_id
            JOIN lecturer_reviews lr
                ON lr.submission_id = s.submission_id
            JOIN slot_requests sr
                ON sr.request_id = s.request_id
            JOIN exam_slot_requests esr
                ON esr.request_id = sr.request_id
            JOIN exams e
                ON e.exam_id = esr.exam_id
            JOIN modules m
                ON m.module_id = e.module_id
            JOIN students stu
                ON stu.student_id = s.student_id
            WHERE s.submission_type = 'EXAM'
              AND ae.api_score IS NOT NULL
              AND lr.final_grade IS NOT NULL
              AND (
                e.created_by = ?
                OR EXISTS (
                    SELECT 1
                    FROM module_lecturers ml
                    WHERE ml.module_id = e.module_id
                      AND ml.lecturer_id = ?
                      AND ml.is_active = TRUE
                )
              )
              AND (? IS NULL OR e.module_id = ?)
              AND (? IS NULL OR DATE(lr.reviewed_at) >= ?)
              AND (? IS NULL OR DATE(lr.reviewed_at) <= ?)
            ORDER BY lr.reviewed_at DESC, s.submission_id DESC
        `, [lecturerId, lecturerId, moduleId, moduleId, startDate, startDate, endDate, endDate]);

        const scopedByBatch = rows.filter((row) => {
            if (!batchYear) return true;
            return toBatchYearFromRegistration(row.registration_number) === batchYear;
        });

        const selectedRows = reduceAttempts(scopedByBatch, attemptMode);
        const enriched = selectedRows.map((row) => {
            const apiScore = toSafeNumber(row.api_score);
            const lecturerGrade = toSafeNumber(row.lecturer_grade);
            const diff = apiScore - lecturerGrade;
            return {
                ...row,
                api_score: Number(apiScore.toFixed(2)),
                lecturer_grade: Number(lecturerGrade.toFixed(2)),
                score_diff: Number(diff.toFixed(2)),
                abs_diff: Number(Math.abs(diff).toFixed(2)),
                batch_year: toBatchYearFromRegistration(row.registration_number)
            };
        });

        const count = enriched.length;
        const mae = count ? enriched.reduce((sum, row) => sum + row.abs_diff, 0) / count : 0;
        const mse = count ? enriched.reduce((sum, row) => sum + (row.score_diff ** 2), 0) / count : 0;
        const rmse = Math.sqrt(mse);
        const bias = count ? enriched.reduce((sum, row) => sum + row.score_diff, 0) / count : 0;
        const avgAi = count ? enriched.reduce((sum, row) => sum + row.api_score, 0) / count : 0;
        const avgLecturer = count ? enriched.reduce((sum, row) => sum + row.lecturer_grade, 0) / count : 0;
        const withinTolerance = enriched.filter((row) => row.abs_diff <= tolerance).length;
        const avgConfidence = count ? enriched.reduce((sum, row) => sum + toSafeNumber(row.confidence), 0) / count : 0;

        const acceptedValues = new Set(["ideal", "acceptable", "acceptable ", "acceptable"]);
        const criteriaRaw = [
            ["smooth_outline_status", "smooth_outline"],
            ["flat_floor_status", "flat_floor"],
            ["depth_status", "depth"],
            ["undercut_status", "undercut"]
        ];
        const criteria = criteriaRaw.map(([field, key]) => {
            const validRows = enriched.filter((row) => row[field] !== null && row[field] !== undefined);
            const acceptableCount = validRows.filter((row) => acceptedValues.has(String(row[field]).trim().toLowerCase())).length;
            return {
                key,
                total: validRows.length,
                acceptable_count: acceptableCount,
                acceptable_rate: validRows.length ? Number(((acceptableCount / validRows.length) * 100).toFixed(2)) : 0
            };
        });

        const moduleMap = new Map();
        for (const row of enriched) {
            const key = row.module_id;
            if (!moduleMap.has(key)) {
                moduleMap.set(key, {
                    module_id: row.module_id,
                    module_code: row.module_code,
                    module_name: row.module_name,
                    total: 0,
                    absDiffTotal: 0,
                    diffTotal: 0
                });
            }
            const entry = moduleMap.get(key);
            entry.total += 1;
            entry.absDiffTotal += row.abs_diff;
            entry.diffTotal += row.score_diff;
        }

        const modules = Array.from(moduleMap.values()).map((entry) => ({
            module_id: entry.module_id,
            module_code: entry.module_code,
            module_name: entry.module_name,
            sample_count: entry.total,
            mae: entry.total ? Number((entry.absDiffTotal / entry.total).toFixed(2)) : 0,
            mean_bias: entry.total ? Number((entry.diffTotal / entry.total).toFixed(2)) : 0
        })).sort((a, b) => b.sample_count - a.sample_count);

        const outliers = [...enriched]
            .sort((a, b) => b.abs_diff - a.abs_diff)
            .slice(0, 20)
            .map((row) => ({
                submission_id: row.submission_id,
                student_name: `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Student",
                registration_number: row.registration_number,
                exam_name: row.exam_name,
                module_code: row.module_code,
                api_score: row.api_score,
                lecturer_grade: row.lecturer_grade,
                score_diff: row.score_diff,
                abs_diff: row.abs_diff
            }));

        return res.json({
            ok: true,
            generated_at: new Date().toISOString(),
            filters: {
                module_id: moduleId,
                batch_year: batchYear,
                start_date: startDate,
                end_date: endDate,
                attempt_mode: attemptMode,
                tolerance
            },
            summary: {
                sample_count: count,
                average_ai_score: Number(avgAi.toFixed(2)),
                average_lecturer_score: Number(avgLecturer.toFixed(2)),
                mae: Number(mae.toFixed(2)),
                rmse: Number(rmse.toFixed(2)),
                mean_bias: Number(bias.toFixed(2)),
                within_tolerance_rate: count ? Number(((withinTolerance / count) * 100).toFixed(2)) : 0,
                average_confidence: Number(avgConfidence.toFixed(2))
            },
            criteria,
            modules,
            outliers
        });
    } catch (error) {
        console.error("AI accuracy report error:", error);
        return res.status(500).json({ ok: false, error: "Failed to generate AI accuracy report" });
    }
});

// =======================================================
// CREATE SUBMISSION
// =======================================================
router.post(
    "/",
    authenticateToken,
    (req, res, next) => {
        upload.array("images", 3)(req, res, (err) => {
            if (!err) return next();

            return res.status(400).json({
                ok: false,
                error: normalizeError(err, "Image upload failed")
            });
        });
    },
    async (req, res) => {
    try {
        const studentId = req.user.id;
        const { requestId, submissionType, comments } = req.body;
        const files = req.files;

        if (req.user.role !== "student") {
            return res.status(403).json({
                ok: false,
                error: "Only students can submit files"
            });
        }

        if (!requestId) {
            return res.status(400).json({
                ok: false,
                error: "Request ID is required"
            });
        }

        if (!submissionType || !["PRACTICE", "EXAM"].includes(submissionType)) {
            return res.status(400).json({
                ok: false,
                error: "Valid submission type is required"
            });
        }

        if (!files || files.length === 0) {
            return res.status(400).json({
                ok: false,
                error: "Please upload at least one image"
            });
        }

        const [requestRows] = await promisePool.query(`
            SELECT
                sr.request_id,
                sr.student_user_id,
                sr.slot_type,
                sr.status,
                sr.booking_date,
                sr.start_time,
                sr.end_time
            FROM slot_requests sr
            WHERE sr.request_id = ?
              AND sr.student_user_id = ?
            LIMIT 1
        `, [requestId, studentId]);

        if (!requestRows.length) {
            return res.status(404).json({
                ok: false,
                error: "Submission slot request not found"
            });
        }

        const slotRequest = requestRows[0];

        if (slotRequest.slot_type !== submissionType) {
            return res.status(400).json({
                ok: false,
                error: "Submission type does not match the selected slot"
            });
        }

        if (submissionType === "EXAM") {
            const allowedStatuses = ["APPROVED", "COMPLETED"];
            if (!allowedStatuses.includes(String(slotRequest.status || "").toUpperCase())) {
                return res.status(400).json({
                    ok: false,
                    error: "Exam submission is allowed only for approved bookings"
                });
            }

            const [existingExamSubmissionRows] = await promisePool.query(`
                SELECT submission_id
                FROM submissions
                WHERE request_id = ?
                  AND student_id = ?
                  AND submission_type = 'EXAM'
                LIMIT 1
            `, [requestId, studentId]);

            if (existingExamSubmissionRows.length > 0) {
                return res.status(409).json({
                    ok: false,
                    error: "Exam submission already completed. Re-submission is not allowed."
                });
            }

            const [examSlotRows] = await promisePool.query(`
                SELECT
                    ets.slot_date,
                    ets.start_time AS exam_start_time,
                    ets.end_time AS exam_end_time
                FROM exam_slot_requests esr
                JOIN exam_time_slots ets
                  ON esr.slot_id = ets.slot_id
                WHERE esr.request_id = ?
                LIMIT 1
            `, [requestId]);

            if (!examSlotRows.length) {
                return res.status(400).json({
                    ok: false,
                    error: "The selected slot is not linked to an examination"
                });
            }

            const examSlot = examSlotRows[0];
            const slotDateValue = examSlot.slot_date || slotRequest.booking_date;
            const slotEndDate = toLocalDateTime(
                slotDateValue,
                examSlot.exam_end_time || slotRequest.end_time,
                examSlot.exam_start_time || slotRequest.start_time || "23:59:59"
            );

            if (!slotEndDate || Number.isNaN(slotEndDate.getTime())) {
                return res.status(400).json({
                    ok: false,
                    error: "Unable to validate submission window for this exam slot"
                });
            }

            const now = new Date();
            const windowEnd = new Date(slotEndDate.getTime() + (2 * 60 * 60 * 1000));

            if (now < slotEndDate) {
                return res.status(400).json({
                    ok: false,
                    error: "Submission opens after your booked exam slot ends"
                });
            }

            if (now > windowEnd) {
                return res.status(400).json({
                    ok: false,
                    error: "Submission window closed. You can submit only within 2 hours after slot end"
                });
            }
        }

        if (submissionType === "PRACTICE") {
            const allowedStatuses = ["APPROVED", "COMPLETED"];
            if (!allowedStatuses.includes(String(slotRequest.status || "").toUpperCase())) {
                return res.status(400).json({
                    ok: false,
                    error: "Practice submission is allowed only for approved bookings"
                });
            }

            const [existingPracticeSubmissionRows] = await promisePool.query(`
                SELECT submission_id
                FROM submissions
                WHERE request_id = ?
                  AND student_id = ?
                  AND submission_type = 'PRACTICE'
                LIMIT 1
            `, [requestId, studentId]);

            if (existingPracticeSubmissionRows.length > 0) {
                return res.status(409).json({
                    ok: false,
                    error: "Practice submission already completed. Re-submission is not allowed."
                });
            }

            const slotEndDate = toLocalDateTime(
                slotRequest.booking_date,
                slotRequest.end_time,
                slotRequest.start_time || "23:59:59"
            );

            if (!slotEndDate || Number.isNaN(slotEndDate.getTime())) {
                return res.status(400).json({
                    ok: false,
                    error: "Unable to validate submission window for this practice slot"
                });
            }

            const now = new Date();
            const windowEnd = new Date(slotEndDate.getTime() + (2 * 60 * 60 * 1000));

            if (now < slotEndDate) {
                return res.status(400).json({
                    ok: false,
                    error: "Submission opens after your booked practice slot ends"
                });
            }

            if (now > windowEnd) {
                return res.status(400).json({
                    ok: false,
                    error: "Submission window closed. You can submit only within 2 hours after slot end"
                });
            }

            const [practiceLinkRows] = await promisePool.query(`
                SELECT
                    psr.request_id,
                    psr.module_id,
                    esr.exam_id,
                    DATE_FORMAT(e.exam_date, '%Y-%m-%d') AS exam_date,
                    TIME_FORMAT(e.start_time, '%H:%i') AS exam_start_time
                FROM practice_slot_requests psr
                LEFT JOIN exam_slot_requests esr
                  ON esr.request_id = psr.request_id
                LEFT JOIN exams e
                  ON e.exam_id = esr.exam_id
                WHERE psr.request_id = ?
                LIMIT 1
            `, [requestId]);

            if (!practiceLinkRows.length) {
                return res.status(400).json({
                    ok: false,
                    error: "The selected slot is not linked to a practice session"
                });
            }

            const practiceLink = practiceLinkRows[0];
            if (practiceLink.exam_date) {
                const examStart = toLocalDateTime(
                    practiceLink.exam_date,
                    practiceLink.exam_start_time,
                    "23:59:59"
                );

                if (examStart && new Date().getTime() >= examStart.getTime()) {
                    return res.status(400).json({
                        ok: false,
                        error: "Practice submission is closed because the exam period has started. Practice work must be submitted before exam date/time."
                    });
                }
            }
        }

        const [attemptRows] = await promisePool.query(`
            SELECT COUNT(*) AS attempts
            FROM submissions
            WHERE request_id = ?
              AND student_id = ?
              AND submission_type = ?
        `, [requestId, studentId, submissionType]);

        const attemptNumber = Number(attemptRows[0].attempts || 0) + 1;

        const [submissionResult] = await promisePool.query(`
            INSERT INTO submissions (
                request_id,
                student_id,
                submission_type,
                attempt_number,
                comments
            )
            VALUES (?, ?, ?, ?, ?)
        `, [
            requestId,
            studentId,
            submissionType,
            attemptNumber,
            comments || null
        ]);

        const submissionId = submissionResult.insertId;

        const filePaths = [];

        for (const file of files) {
            const relativeFileUrl = `/uploads/submissions/${path.basename(file.path)}`;
            filePaths.push(file.path);

            await promisePool.query(`
                INSERT INTO submission_files (
                    submission_id,
                    file_url,
                    file_type,
                    file_size_bytes
                )
                VALUES (?, ?, ?, ?)
            `, [
                submissionId,
                relativeFileUrl,
                file.mimetype || null,
                file.size || null
            ]);
        }

let aiEvaluation = null;

try {
    const evaluated = await evaluateImages(filePaths);

    await promisePool.query(`
        INSERT INTO api_evaluations (
            submission_id,
            api_status,
            api_score,
            confidence,
            smooth_outline_status,
            flat_floor_status,
            depth_status,
            undercut_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        submissionId,
        evaluated.api_status,
        evaluated.api_score,
        evaluated.confidence,
        mapAiStatusForDb(evaluated.smooth_outline_status),
        mapAiStatusForDb(evaluated.flat_floor_status),
        mapAiStatusForDb(evaluated.depth_status),
        mapAiStatusForDb(evaluated.undercut_status)
    ]);

    aiEvaluation = evaluated;
} catch (aiError) {
    console.error("AI Evaluation failed:", aiError);
    aiEvaluation = null;

    await promisePool.query(`
        INSERT INTO api_evaluations (
            submission_id,
            api_status
        )
        VALUES (?, 'FAILED')
    `, [
        submissionId
    ]);
}

        if (submissionType === "PRACTICE") {
            const passFail = (aiEvaluation && aiEvaluation.api_score >= 10) ? 'PASS' : 'FAIL';
            const finalGrade = aiEvaluation ? aiEvaluation.api_score : 0;
            const finalFeedback = aiEvaluation 
                ? `AI Graded: Smooth Outline (${aiEvaluation.smooth_outline_status}), Flat Floor (${aiEvaluation.flat_floor_status}), Depth (${aiEvaluation.depth_status}), Undercut (${aiEvaluation.undercut_status}).`
                : "AI Evaluation Failed. Please try again or contact admin.";
                
            await promisePool.query(`
                INSERT INTO final_results (
                    submission_id,
                    final_grade,
                    final_feedback,
                    pass_fail
                )
                VALUES (?, ?, ?, ?)
            `, [
                submissionId,
                finalGrade,
                finalFeedback,
                passFail
            ]);

            await createNotification({
                recipientRole: "student",
                recipientId: studentId,
                title: "Practice result published",
                message: "Your practice submission was evaluated by AI and the result is now available.",
                notificationType: "result",
                relatedEntityType: "submission",
                relatedEntityId: submissionId
            });
        } else {
            const [lecturerRows] = await promisePool.query(`
                SELECT DISTINCT ml.lecturer_id
                FROM exam_slot_requests esr
                JOIN exams e
                    ON esr.exam_id = e.exam_id
                JOIN module_lecturers ml
                    ON ml.module_id = e.module_id
                   AND ml.is_active = TRUE
                WHERE esr.request_id = ?
            `, [requestId]);

            for (const lecturer of lecturerRows) {
                await createNotification({
                    recipientRole: "lecturer",
                    recipientId: lecturer.lecturer_id,
                    title: "Exam submission ready for review",
                    message: "A student exam submission has been AI evaluated and is ready for lecturer review.",
                    notificationType: "evaluation",
                    relatedEntityType: "submission",
                    relatedEntityId: submissionId
                });
            }
        }

        return res.status(201).json({
            ok: true,
            message: "Submission created successfully",
            submissionId,
            attemptNumber
        });
    } catch (error) {
        console.error("Create submission error:", error);
        return res.status(500).json({
            ok: false,
            error: normalizeError(error, "Submission failed")
        });
    }
});

// =======================================================
// SAVE LECTURER REVIEW
// =======================================================
router.post("/:submission_id/review", authenticateToken, async (req, res) => {
    try {
        const lecturerId = req.user.id;
        const role = req.user.role;

        if (role !== "lecturer") {
            return res.status(403).json({
                ok: false,
                error: "Only lecturers can review submissions"
            });
        }

        const submissionId = req.params.submission_id;
        const {
            finalGrade,
            lecturerFeedback,
            decision,
            overrideReason,
            retakeRequired
        } = req.body;

        if (finalGrade === undefined) {
            return res.status(400).json({
                ok: false,
                error: "Final grade is required"
            });
        }

        const normalizedFinalGrade = Number(finalGrade);
        if (!Number.isFinite(normalizedFinalGrade) || normalizedFinalGrade < 0 || normalizedFinalGrade > 100) {
            return res.status(400).json({
                ok: false,
                error: "Final grade must be a valid number between 0 and 100"
            });
        }

        const allowed = await canLecturerAccessSubmission(submissionId, lecturerId);

        if (!allowed) {
            return res.status(403).json({
                ok: false,
                error: "You can only review submissions for your assigned module"
            });
        }

        const [examRows] = await promisePool.query(`
            SELECT e.passing_grade
            FROM submissions s
            JOIN slot_requests sr
              ON sr.request_id = s.request_id
            JOIN exam_slot_requests esr
              ON esr.request_id = sr.request_id
            JOIN exams e
              ON e.exam_id = esr.exam_id
            WHERE s.submission_id = ?
              AND s.submission_type = 'EXAM'
            LIMIT 1
        `, [submissionId]);

        if (!examRows.length) {
            return res.status(404).json({
                ok: false,
                error: "Exam submission not found"
            });
        }

        const passingGradeRaw = Number(examRows[0].passing_grade);
        const passingGrade = Number.isFinite(passingGradeRaw) ? passingGradeRaw : 50;
        const autoPassFailDecision = normalizedFinalGrade >= passingGrade ? "PASS" : "FAIL";
        const normalizedIncomingDecision = String(decision || "").trim().toUpperCase();
        const wantsRetake = retakeRequired === true
            || String(retakeRequired || "").toLowerCase() === "true"
            || normalizedIncomingDecision === "RETAKE";

        let normalizedDecision = autoPassFailDecision;
        if (wantsRetake) {
            if (autoPassFailDecision === "PASS") {
                return res.status(400).json({
                    ok: false,
                    error: "Retake can only be enabled when final grade is below the exam passing cutoff"
                });
            }
            normalizedDecision = "RETAKE";
        }

        await promisePool.query(`
            INSERT INTO lecturer_reviews (
                submission_id,
                lecturer_id,
                final_grade,
                lecturer_feedback,
                decision,
                override_reason
            )
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                lecturer_id = VALUES(lecturer_id),
                final_grade = VALUES(final_grade),
                lecturer_feedback = VALUES(lecturer_feedback),
                decision = VALUES(decision),
                override_reason = VALUES(override_reason),
                reviewed_at = CURRENT_TIMESTAMP
        `, [
            submissionId,
            lecturerId,
            normalizedFinalGrade,
            lecturerFeedback || null,
            normalizedDecision,
            overrideReason || null
        ]);

        return res.json({
            ok: true,
            message: "Lecturer review saved successfully",
            decision: normalizedDecision,
            passFail: autoPassFailDecision,
            passingGrade
        });
    } catch (error) {
        console.error("Save lecturer review error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to save lecturer review"
        });
    }
});

// =======================================================
// PUBLISH FINAL RESULT
// =======================================================
router.post("/:submission_id/publish", authenticateToken, async (req, res) => {
    try {
        const lecturerId = req.user.id;
        const role = req.user.role;

        if (role !== "lecturer") {
            return res.status(403).json({
                ok: false,
                error: "Only lecturers can publish results"
            });
        }

        const submissionId = req.params.submission_id;

        const allowed = await canLecturerAccessSubmission(submissionId, lecturerId);

        if (!allowed) {
            return res.status(403).json({
                ok: false,
                error: "You can only publish submissions for your assigned module"
            });
        }

        const [reviewRows] = await promisePool.query(`
            SELECT
                final_grade,
                lecturer_feedback,
                decision
            FROM lecturer_reviews
            WHERE submission_id = ?
            LIMIT 1
        `, [submissionId]);

        if (!reviewRows.length) {
            return res.status(400).json({
                ok: false,
                error: "Review must be completed before publishing"
            });
        }

        const review = reviewRows[0];
        const normalizedDecision = String(review.decision || "").toUpperCase();
        const passFail = normalizedDecision === "PASS" ? "PASS" : "FAIL";

        await promisePool.query(`
            INSERT INTO final_results (
                submission_id,
                final_grade,
                final_feedback,
                pass_fail,
                published_by
            )
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                final_grade = VALUES(final_grade),
                final_feedback = VALUES(final_feedback),
                pass_fail = VALUES(pass_fail),
                published_by = VALUES(published_by),
                published_at = CURRENT_TIMESTAMP
        `, [
            submissionId,
            review.final_grade,
            review.lecturer_feedback || null,
            passFail,
            lecturerId
        ]);

        const [submissionRows] = await promisePool.query(`
            SELECT
                s.student_id,
                st.email AS student_email,
                st.first_name AS student_first_name,
                st.last_name AS student_last_name,
                e.exam_name,
                m.module_code,
                m.module_name
            FROM submissions
            s
            JOIN students st
              ON st.student_id = s.student_id
            LEFT JOIN exam_slot_requests esr
              ON esr.request_id = s.request_id
            LEFT JOIN exams e
              ON e.exam_id = esr.exam_id
            LEFT JOIN modules m
              ON m.module_id = e.module_id
            WHERE s.submission_id = ?
            LIMIT 1
        `, [submissionId]);

        if (submissionRows.length) {
            const submission = submissionRows[0];

            const isRetake = normalizedDecision === "RETAKE";
            await createNotification({
                recipientRole: "student",
                recipientId: submission.student_id,
                title: isRetake ? "Retake required" : "Exam result published",
                message: isRetake
                    ? "Your lecturer has released the result and marked this exam for retake. Open the module page to request a retake slot."
                    : "Your lecturer has published the final result for your exam submission.",
                notificationType: "result",
                relatedEntityType: "submission",
                relatedEntityId: submissionId
            });

            if (hasSmtpConfig() && submission.student_email) {
                const studentName = `${submission.student_first_name || ""} ${submission.student_last_name || ""}`.trim() || "Student";
                const examName = submission.exam_name || "Practical Exam";
                const moduleText = submission.module_code
                    ? `${submission.module_code} - ${submission.module_name || ""}`.trim()
                    : "your module";

                const mailResult = await sendEmail({
                    to: submission.student_email,
                    subject: normalizedDecision === "RETAKE"
                        ? "DentaNet: Exam Result Released - Retake Required"
                        : "DentaNet: Exam Result Released",
                    html: `
                        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                            <h2>Exam Result Released</h2>
                            <p>Hello ${studentName},</p>
                            <p>Your lecturer has released the final result for your exam submission.</p>
                            <p><strong>Module:</strong> ${moduleText}</p>
                            <p><strong>Exam:</strong> ${examName}</p>
                            ${normalizedDecision === "RETAKE"
                                ? "<p><strong>Action:</strong> Please log in to DentaNet LMS and request your retake exam slot.</p>"
                                : ""
                            }
                            <p>Please log in to DentaNet LMS to view your released result and detailed feedback.</p>
                        </div>
                    `,
                    text: normalizedDecision === "RETAKE"
                        ? `Your exam result is released for ${examName} (${moduleText}). Please log in to DentaNet LMS and request a retake exam slot, then view your full feedback.`
                        : `Your exam result is released for ${examName} (${moduleText}). Please log in to DentaNet LMS to view your result and detailed feedback.`
                });

                if (!mailResult.ok) {
                    console.warn("Result release email failed:", mailResult.error || "Unknown error");
                }
            }
        }

        return res.json({
            ok: true,
            message: "Final result published successfully"
        });
    } catch (error) {
        console.error("Publish final result error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to publish final result"
        });
    }
});

// =======================================================
// STUDENT RETAKE REQUEST
// =======================================================
router.post("/:submission_id/retake-request", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "student") {
            return res.status(403).json({
                ok: false,
                error: "Only students can request retakes"
            });
        }

        const submissionId = Number(req.params.submission_id);
        const studentId = Number(req.user.id);
        if (!submissionId) {
            return res.status(400).json({ ok: false, error: "Invalid submission id" });
        }

        const [rows] = await promisePool.query(`
            SELECT
                s.submission_id,
                s.student_id,
                s.request_id,
                e.exam_id,
                e.exam_name,
                m.module_id,
                m.module_code,
                m.module_name,
                lr.decision
            FROM submissions s
            JOIN exam_slot_requests esr
              ON esr.request_id = s.request_id
            JOIN exams e
              ON e.exam_id = esr.exam_id
            LEFT JOIN modules m
              ON m.module_id = e.module_id
            LEFT JOIN lecturer_reviews lr
              ON lr.submission_id = s.submission_id
            WHERE s.submission_id = ?
              AND s.student_id = ?
              AND s.submission_type = 'EXAM'
            LIMIT 1
        `, [submissionId, studentId]);

        if (!rows.length) {
            return res.status(404).json({
                ok: false,
                error: "Exam submission not found for this student"
            });
        }

        const submission = rows[0];
        const decision = String(submission.decision || "").toUpperCase();
        if (decision !== "RETAKE") {
            return res.status(400).json({
                ok: false,
                error: "Retake can be requested only when lecturer decision is RETAKE"
            });
        }

        const [existingPending] = await promisePool.query(`
            SELECT retake_id
            FROM retake_requests
            WHERE submission_id = ?
              AND status = 'PENDING'
            LIMIT 1
        `, [submissionId]);

        if (existingPending.length) {
            return res.status(409).json({
                ok: false,
                error: "A retake request is already pending for this submission"
            });
        }

        const studentColumn = await getRetakeStudentColumn();
        await promisePool.query(
            `INSERT INTO retake_requests (submission_id, ${studentColumn}, status) VALUES (?, ?, 'PENDING')`,
            [submissionId, studentId]
        );

        await notifyAdmins({
            title: "Retake request",
            message: `A student requested a retake for ${submission.exam_name || "an exam"}.`,
            notificationType: "slot_request",
            relatedEntityType: "submission",
            relatedEntityId: submissionId
        });

        await createNotification({
            recipientRole: "student",
            recipientId: studentId,
            title: "Retake requested",
            message: `Your retake request for ${submission.exam_name || "the exam"} was sent to admin.`,
            notificationType: "system",
            relatedEntityType: "submission",
            relatedEntityId: submissionId
        });

        return res.json({
            ok: true,
            message: "Retake request submitted successfully"
        });
    } catch (error) {
        console.error("Create retake request error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to submit retake request"
        });
    }
});

module.exports = router;
