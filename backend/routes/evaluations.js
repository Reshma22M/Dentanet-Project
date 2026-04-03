const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

// --------------------------------------------------
// Submit AI evaluation
// --------------------------------------------------
router.post("/ai", authenticateToken, async (req, res) => {
    try {
        const {
            submission_id,
            final_grade,
            ai_comment,
            smooth_outline_status,
            flat_floor_status,
            depth_status,
            undercut_status,
            processing_time_seconds
        } = req.body;

        if (
            !submission_id ||
            final_grade === undefined ||
            !smooth_outline_status ||
            !flat_floor_status ||
            !depth_status ||
            !undercut_status
        ) {
            return res.status(400).json({
                ok: false,
                error: "Missing required fields: submission_id, final_grade, and all feature statuses"
            });
        }

        const [submissionRows] = await promisePool.query(
            `SELECT submission_id FROM exam_submissions WHERE submission_id = ? LIMIT 1`,
            [submission_id]
        );

        if (submissionRows.length === 0) {
            return res.status(404).json({
                ok: false,
                error: "Submission not found"
            });
        }

        const [result] = await promisePool.query(
            `
            INSERT INTO ai_evaluations
            (
                submission_id,
                final_grade,
                ai_comment,
                smooth_outline_status,
                flat_floor_status,
                depth_status,
                undercut_status,
                processing_time_seconds
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                submission_id,
                final_grade,
                ai_comment || null,
                smooth_outline_status,
                flat_floor_status,
                depth_status,
                undercut_status,
                processing_time_seconds || null
            ]
        );

        await promisePool.query(
            `UPDATE exam_submissions
             SET status = ?
             WHERE submission_id = ?`,
            ["evaluated", submission_id]
        );

        return res.status(201).json({
            ok: true,
            message: "AI evaluation submitted successfully",
            ai_evaluation_id: result.insertId
        });
    } catch (error) {
        console.error("AI evaluation error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to submit AI evaluation"
        });
    }
});

// --------------------------------------------------
// Get AI evaluation by submission ID
// --------------------------------------------------
router.get("/ai/:submissionId", authenticateToken, async (req, res) => {
    try {
        const { submissionId } = req.params;

        const [evaluations] = await promisePool.query(
            `SELECT * FROM ai_evaluations WHERE submission_id = ? LIMIT 1`,
            [submissionId]
        );

        if (evaluations.length === 0) {
            return res.status(404).json({
                ok: false,
                error: "AI evaluation not found"
            });
        }

        return res.json({
            ok: true,
            ai_evaluation: evaluations[0]
        });
    } catch (error) {
        console.error("Get AI evaluation error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to fetch AI evaluation"
        });
    }
});

// --------------------------------------------------
// Submit lecturer evaluation
// --------------------------------------------------
router.post("/lecturer", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "lecturer") {
            return res.status(403).json({
                ok: false,
                error: "Only lecturers can submit lecturer evaluations"
            });
        }

        const {
            submission_id,
            lecturer_grade,
            feedback,
            override_ai
        } = req.body;

        if (!submission_id || lecturer_grade === undefined) {
            return res.status(400).json({
                ok: false,
                error: "Missing required fields: submission_id and lecturer_grade"
            });
        }

        const lecturerId = req.user.id;

        const [submissionRows] = await promisePool.query(
            `SELECT submission_id FROM exam_submissions WHERE submission_id = ? LIMIT 1`,
            [submission_id]
        );

        if (submissionRows.length === 0) {
            return res.status(404).json({
                ok: false,
                error: "Submission not found"
            });
        }

        const [result] = await promisePool.query(
            `
            INSERT INTO lecturer_evaluations
            (
                submission_id,
                lecturer_id,
                lecturer_grade,
                feedback,
                override_ai
            )
            VALUES (?, ?, ?, ?, ?)
            `,
            [
                submission_id,
                lecturerId,
                lecturer_grade,
                feedback || null,
                override_ai || false
            ]
        );

        await promisePool.query(
            `
            UPDATE exam_submissions
            SET final_grade = ?, status = ?
            WHERE submission_id = ?
            `,
            [lecturer_grade, "graded", submission_id]
        );

        return res.status(201).json({
            ok: true,
            message: "Lecturer evaluation submitted successfully",
            evaluation_id: result.insertId
        });
    } catch (error) {
        console.error("Lecturer evaluation error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to submit lecturer evaluation"
        });
    }
});

// --------------------------------------------------
// Get evaluation details (AI + Lecturer) for a submission
// --------------------------------------------------
router.get("/:submissionId", authenticateToken, async (req, res) => {
    try {
        const { submissionId } = req.params;

        const [aiEval] = await promisePool.query(
            `SELECT * FROM ai_evaluations WHERE submission_id = ? LIMIT 1`,
            [submissionId]
        );

        const [lecturerEval] = await promisePool.query(
            `
            SELECT
                le.*,
                l.first_name,
                l.last_name
            FROM lecturer_evaluations le
            JOIN lecturers l
              ON le.lecturer_id = l.lecturer_id
            WHERE le.submission_id = ?
            LIMIT 1
            `,
            [submissionId]
        );

        return res.json({
            ok: true,
            ai_evaluation: aiEval[0] || null,
            lecturer_evaluation: lecturerEval[0] || null
        });
    } catch (error) {
        console.error("Get evaluations error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to fetch evaluations"
        });
    }
});

module.exports = router;