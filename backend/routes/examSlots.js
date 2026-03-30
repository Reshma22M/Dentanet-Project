const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

function normalizeDateOnly(value) {
    if (!value) return null;

    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    if (typeof value === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        const [dd, mm, yyyy] = value.split("/");
        return `${yyyy}-${mm}-${dd}`;
    }

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;

    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function normalizeTimeValue(value) {
    if (!value) return null;
    return String(value).slice(0, 5); // HH:MM
}

// ==========================================
// GET ALL SLOTS FOR ONE EXAM
// ==========================================
router.get("/exam/:examId", authenticateToken, async (req, res) => {
    try {
        const examId = Number(req.params.examId);

        if (!examId) {
            return res.status(400).json({
                ok: false,
                error: "Invalid exam id"
            });
        }

        const [rows] = await promisePool.query(
            `
            SELECT
                ets.slot_id,
                ets.exam_id,
                DATE_FORMAT(ets.slot_date, '%Y-%m-%d') AS slot_date,
                TIME_FORMAT(ets.start_time, '%H:%i') AS start_time,
                TIME_FORMAT(ets.end_time, '%H:%i') AS end_time,
                ets.max_machines,
                ets.is_active,
                ets.created_by,
                ets.created_at,
                ets.updated_at,
                e.exam_name,
                e.status AS exam_status,
                COUNT(sr.request_id) AS booked_count
            FROM exam_time_slots ets
            LEFT JOIN exams e
                ON ets.exam_id = e.exam_id
            LEFT JOIN exam_slot_requests esr
                ON ets.slot_id = esr.slot_id
            LEFT JOIN slot_requests sr
                ON esr.request_id = sr.request_id
                AND sr.status IN ('PENDING', 'APPROVED')
            WHERE ets.exam_id = ?
              AND ets.is_active = TRUE
            GROUP BY
                ets.slot_id,
                ets.exam_id,
                ets.slot_date,
                ets.start_time,
                ets.end_time,
                ets.max_machines,
                ets.is_active,
                ets.created_by,
                ets.created_at,
                ets.updated_at,
                e.exam_name,
                e.status
            ORDER BY ets.slot_date ASC, ets.start_time ASC
            `,
            [examId]
        );

        return res.json({
            ok: true,
            slots: rows
        });
    } catch (error) {
        console.error("Get exam slots error:", error);
        return res.status(500).json({
            ok: false,
            error: error.message || "Failed to fetch exam slots"
        });
    }
});

// ==========================================
// CREATE EXAM SLOT (ADMIN ONLY)
// ==========================================
router.post("/", authenticateToken, authorizeRole("admin"), async (req, res) => {
    try {
        const {
            exam_id,
            slot_date,
            start_time,
            end_time,
            max_machines
        } = req.body;

        if (!exam_id || !slot_date || !start_time || !end_time || !max_machines) {
            return res.status(400).json({
                ok: false,
                error: "exam_id, slot_date, start_time, end_time and max_machines are required"
            });
        }

        const normalizedSlotDate = normalizeDateOnly(slot_date);
        const normalizedSlotStart = normalizeTimeValue(start_time);
        const normalizedSlotEnd = normalizeTimeValue(end_time);

        if (!normalizedSlotDate) {
            return res.status(400).json({
                ok: false,
                error: "Invalid slot date"
            });
        }

        if (!normalizedSlotStart || !normalizedSlotEnd) {
            return res.status(400).json({
                ok: false,
                error: "Invalid start_time or end_time"
            });
        }

        if (normalizedSlotEnd <= normalizedSlotStart) {
            return res.status(400).json({
                ok: false,
                error: "end_time must be after start_time"
            });
        }

        if (Number(max_machines) < 1) {
            return res.status(400).json({
                ok: false,
                error: "max_machines must be at least 1"
            });
        }

        const [examRows] = await promisePool.query(
            `
            SELECT
                exam_id,
                DATE_FORMAT(exam_date, '%Y-%m-%d') AS exam_date,
                TIME_FORMAT(start_time, '%H:%i') AS start_time,
                TIME_FORMAT(end_time, '%H:%i') AS end_time,
                is_active
            FROM exams
            WHERE exam_id = ?
            LIMIT 1
            `,
            [exam_id]
        );

        if (examRows.length === 0) {
            return res.status(404).json({
                ok: false,
                error: "Exam not found"
            });
        }

        const exam = examRows[0];

        if (!exam.is_active) {
            return res.status(400).json({
                ok: false,
                error: "Exam is inactive"
            });
        }

        const normalizedExamDate = normalizeDateOnly(exam.exam_date);
        const normalizedExamStart = normalizeTimeValue(exam.start_time);
        const normalizedExamEnd = normalizeTimeValue(exam.end_time);

        if (!normalizedExamDate || normalizedSlotDate !== normalizedExamDate) {
            return res.status(400).json({
                ok: false,
                error: "Slot date must match the exam date"
            });
        }

        if (normalizedExamStart && normalizedSlotStart < normalizedExamStart) {
            return res.status(400).json({
                ok: false,
                error: "Slot start time cannot be earlier than exam start time"
            });
        }

        if (normalizedExamEnd && normalizedSlotEnd > normalizedExamEnd) {
            return res.status(400).json({
                ok: false,
                error: "Slot end time cannot be later than exam end time"
            });
        }

        const [overlapRows] = await promisePool.query(
            `
            SELECT slot_id
            FROM exam_time_slots
            WHERE exam_id = ?
              AND slot_date = ?
              AND is_active = TRUE
              AND (
                    (start_time < ? AND end_time > ?)
                 OR (start_time < ? AND end_time > ?)
                 OR (start_time >= ? AND end_time <= ?)
              )
            `,
            [
                exam_id,
                normalizedSlotDate,
                normalizedSlotEnd,
                normalizedSlotStart,
                normalizedSlotEnd,
                normalizedSlotStart,
                normalizedSlotStart,
                normalizedSlotEnd
            ]
        );

        if (overlapRows.length > 0) {
            return res.status(409).json({
                ok: false,
                error: "This exam slot overlaps with an existing slot"
            });
        }

        const [result] = await promisePool.query(
            `
            INSERT INTO exam_time_slots
            (
                exam_id,
                slot_date,
                start_time,
                end_time,
                max_machines,
                is_active,
                created_by
            )
            VALUES (?, ?, ?, ?, ?, TRUE, ?)
            `,
            [
                exam_id,
                normalizedSlotDate,
                normalizedSlotStart,
                normalizedSlotEnd,
                Number(max_machines),
                req.user.id
            ]
        );

        const [rows] = await promisePool.query(
            `
            SELECT
                slot_id,
                exam_id,
                DATE_FORMAT(slot_date, '%Y-%m-%d') AS slot_date,
                TIME_FORMAT(start_time, '%H:%i') AS start_time,
                TIME_FORMAT(end_time, '%H:%i') AS end_time,
                max_machines,
                is_active,
                created_by,
                created_at,
                updated_at
            FROM exam_time_slots
            WHERE slot_id = ?
            LIMIT 1
            `,
            [result.insertId]
        );

        return res.status(201).json({
            ok: true,
            message: "Exam slot created successfully",
            slot: rows[0]
        });
    } catch (error) {
        console.error("Create exam slot error:", error);
        return res.status(500).json({
            ok: false,
            error: error.message || "Failed to create exam slot"
        });
    }
});

// ==========================================
// UPDATE SLOT (ADMIN ONLY)
// ==========================================
router.put("/:slotId", authenticateToken, authorizeRole("admin"), async (req, res) => {
    try {
        const slotId = Number(req.params.slotId);
        const {
            slot_date,
            start_time,
            end_time,
            max_machines,
            is_active
        } = req.body;

        if (!slotId) {
            return res.status(400).json({
                ok: false,
                error: "Invalid slot id"
            });
        }

        const [existingRows] = await promisePool.query(
            `
            SELECT *
            FROM exam_time_slots
            WHERE slot_id = ?
            LIMIT 1
            `,
            [slotId]
        );

        if (existingRows.length === 0) {
            return res.status(404).json({
                ok: false,
                error: "Exam slot not found"
            });
        }

        const existing = existingRows[0];

        const finalDate = normalizeDateOnly(slot_date || existing.slot_date);
        const finalStart = normalizeTimeValue(start_time || existing.start_time);
        const finalEnd = normalizeTimeValue(end_time || existing.end_time);
        const finalMaxMachines = max_machines !== undefined ? Number(max_machines) : existing.max_machines;
        const finalIsActive = is_active !== undefined ? is_active : existing.is_active;

        if (!finalDate) {
            return res.status(400).json({
                ok: false,
                error: "Invalid slot date"
            });
        }

        if (!finalStart || !finalEnd) {
            return res.status(400).json({
                ok: false,
                error: "Invalid start_time or end_time"
            });
        }

        if (finalEnd <= finalStart) {
            return res.status(400).json({
                ok: false,
                error: "end_time must be after start_time"
            });
        }

        if (finalMaxMachines < 1) {
            return res.status(400).json({
                ok: false,
                error: "max_machines must be at least 1"
            });
        }

        await promisePool.query(
            `
            UPDATE exam_time_slots
            SET
                slot_date = ?,
                start_time = ?,
                end_time = ?,
                max_machines = ?,
                is_active = ?
            WHERE slot_id = ?
            `,
            [
                finalDate,
                finalStart,
                finalEnd,
                finalMaxMachines,
                finalIsActive,
                slotId
            ]
        );

        const [rows] = await promisePool.query(
            `
            SELECT
                slot_id,
                exam_id,
                DATE_FORMAT(slot_date, '%Y-%m-%d') AS slot_date,
                TIME_FORMAT(start_time, '%H:%i') AS start_time,
                TIME_FORMAT(end_time, '%H:%i') AS end_time,
                max_machines,
                is_active,
                created_by,
                created_at,
                updated_at
            FROM exam_time_slots
            WHERE slot_id = ?
            LIMIT 1
            `,
            [slotId]
        );

        return res.json({
            ok: true,
            message: "Exam slot updated successfully",
            slot: rows[0]
        });
    } catch (error) {
        console.error("Update exam slot error:", error);
        return res.status(500).json({
            ok: false,
            error: error.message || "Failed to update exam slot"
        });
    }
});

// ==========================================
// DELETE SLOT (ADMIN ONLY) - SOFT DELETE
// ==========================================
router.delete("/:slotId", authenticateToken, authorizeRole("admin"), async (req, res) => {
    try {
        const slotId = Number(req.params.slotId);

        if (!slotId) {
            return res.status(400).json({
                ok: false,
                error: "Invalid slot id"
            });
        }

        const [existingRows] = await promisePool.query(
            `
            SELECT slot_id
            FROM exam_time_slots
            WHERE slot_id = ?
            LIMIT 1
            `,
            [slotId]
        );

        if (existingRows.length === 0) {
            return res.status(404).json({
                ok: false,
                error: "Exam slot not found"
            });
        }

        await promisePool.query(
            `
            UPDATE exam_time_slots
            SET is_active = FALSE
            WHERE slot_id = ?
            `,
            [slotId]
        );

        return res.json({
            ok: true,
            message: "Exam slot deleted successfully"
        });
    } catch (error) {
        console.error("Delete exam slot error:", error);
        return res.status(500).json({
            ok: false,
            error: error.message || "Failed to delete exam slot"
        });
    }
});

module.exports = router;