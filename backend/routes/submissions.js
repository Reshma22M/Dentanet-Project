const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

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
                psr.purpose,

                latest.submission_id,
                latest.attempt_number,
                latest.submitted_at,

                ae.api_score,
                ae.api_status,

                fr.final_grade,
                fr.final_feedback,
                fr.pass_fail

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
                fr.pass_fail

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
                ets.end_time AS exam_end_time

            FROM exam_slot_requests esr
            JOIN slot_requests sr
                ON esr.request_id = sr.request_id
            JOIN exam_time_slots ets
                ON esr.slot_id = ets.slot_id
            JOIN exams e
                ON esr.exam_id = e.exam_id

            WHERE sr.student_user_id = ?
              AND e.exam_id = ?
            ORDER BY ets.slot_date DESC, ets.start_time DESC
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
                fr.pass_fail

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
// CREATE SUBMISSION
// =======================================================
router.post("/", authenticateToken, upload.array("images", 3), async (req, res) => {
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
                sr.status
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

        if (!["APPROVED", "COMPLETED"].includes(slotRequest.status)) {
            return res.status(400).json({
                ok: false,
                error: "Submission is allowed only for approved or completed slots"
            });
        }

        if (slotRequest.slot_type !== submissionType) {
            return res.status(400).json({
                ok: false,
                error: "Submission type does not match the selected slot"
            });
        }

        if (submissionType === "EXAM") {
            const [examLinkRows] = await promisePool.query(`
                SELECT request_id
                FROM exam_slot_requests
                WHERE request_id = ?
                LIMIT 1
            `, [requestId]);

            if (!examLinkRows.length) {
                return res.status(400).json({
                    ok: false,
                    error: "The selected slot is not linked to an examination"
                });
            }
        }

        if (submissionType === "PRACTICE") {
            const [practiceLinkRows] = await promisePool.query(`
                SELECT request_id
                FROM practice_slot_requests
                WHERE request_id = ?
                LIMIT 1
            `, [requestId]);

            if (!practiceLinkRows.length) {
                return res.status(400).json({
                    ok: false,
                    error: "The selected slot is not linked to a practice session"
                });
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

        for (const file of files) {
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
                `/uploads/submissions/${path.basename(file.path)}`,
                file.mimetype,
                file.size
            ]);
        }

        if (submissionType === "PRACTICE") {
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
                0,
                "Pending automated evaluation",
                "FAIL"
            ]);
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

        if (!["lecturer", "admin"].includes(role)) {
            return res.status(403).json({
                ok: false,
                error: "Only lecturers can review submissions"
            });
        }

        const submissionId = req.params.submission_id;
        const { finalGrade, lecturerFeedback, decision, overrideReason } = req.body;

        if (finalGrade === undefined || !decision) {
            return res.status(400).json({
                ok: false,
                error: "Final grade and decision are required"
            });
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
            finalGrade,
            lecturerFeedback || null,
            decision,
            overrideReason || null
        ]);

        return res.json({
            ok: true,
            message: "Lecturer review saved successfully"
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

        if (!["lecturer", "admin"].includes(role)) {
            return res.status(403).json({
                ok: false,
                error: "Only lecturers can publish results"
            });
        }

        const submissionId = req.params.submission_id;

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
        const passFail = review.decision === "PASS" ? "PASS" : "FAIL";

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

module.exports = router;