const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

function normalizeDateOnly(value) {
    if (!value) return null;

    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
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
    return String(value).slice(0, 5);
}

function buildDateTime(dateValue, timeValue) {
    const date = normalizeDateOnly(dateValue);
    const time = normalizeTimeValue(timeValue);

    if (!date || !time) return null;

    const dt = new Date(`${date}T${time}:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

// ==========================================
// GET ALL BOOKINGS
// ==========================================
router.get("/", authenticateToken, async (req, res) => {
    try {
        let query = `
            SELECT
                sr.request_id,
                sr.student_user_id,
                sr.slot_type,
                sr.booking_date,
                sr.start_time,
                sr.end_time,
                sr.status,
                sr.created_at,
                sr.updated_at,

                prs.purpose,
                esr.exam_id,
                esr.slot_id,

                e.exam_name,

                s.first_name,
                s.last_name,
                s.email,
                s.registration_number,

                sa.allocation_id,
                sa.machine_id,
                sa.approved_by,
                sa.approved_at,

                lm.machine_code,
                lm.lab_number,
                lm.status AS machine_status

            FROM slot_requests sr

            LEFT JOIN practice_slot_requests prs
                ON sr.request_id = prs.request_id

            LEFT JOIN exam_slot_requests esr
                ON sr.request_id = esr.request_id

            LEFT JOIN exams e
                ON esr.exam_id = e.exam_id

            LEFT JOIN students s
                ON sr.student_user_id = s.student_id

            LEFT JOIN slot_allocations sa
                ON sr.request_id = sa.request_id

            LEFT JOIN lab_machines lm
                ON sa.machine_id = lm.machine_id
        `;

        const params = [];

        if (req.user.role === "student") {
            query += ` WHERE sr.student_user_id = ?`;
            params.push(req.user.id);
        }

        query += `
            ORDER BY
                sr.booking_date DESC,
                sr.start_time DESC
        `;

        const [rows] = await promisePool.query(query, params);

        res.json({
            ok: true,
            bookings: rows
        });
    } catch (error) {
        console.error("Get bookings error:", error);
        res.status(500).json({
            ok: false,
            error: "Failed to fetch bookings"
        });
    }
});

// ==========================================
// CREATE BOOKING (Student)
// ==========================================
router.post("/", authenticateToken, async (req, res) => {
    const connection = await promisePool.getConnection();

    try {
        if (req.user.role !== "student") {
            return res.status(403).json({
                ok: false,
                error: "Only students can create booking requests"
            });
        }

        const {
            slotType,
            bookingDate,
            startTime,
            endTime,
            purpose,
            examId,
            slotId
        } = req.body;

        const studentId = req.user.id;
        const normalizedSlotType = String(slotType || "").toUpperCase();
        const normalizedBookingDate = normalizeDateOnly(bookingDate);
        const normalizedStartTime = normalizeTimeValue(startTime);
        const normalizedEndTime = normalizeTimeValue(endTime);

        if (!normalizedSlotType || !normalizedBookingDate || !normalizedStartTime || !normalizedEndTime) {
            return res.status(400).json({
                ok: false,
                error: "Required fields missing"
            });
        }

        const bookingStartDateTime = buildDateTime(normalizedBookingDate, normalizedStartTime);

        if (!bookingStartDateTime) {
            return res.status(400).json({
                ok: false,
                error: "Invalid booking date or time"
            });
        }

        if (bookingStartDateTime.getTime() < Date.now()) {
            return res.status(400).json({
                ok: false,
                error: "You cannot create a booking for a past date or time"
            });
        }

        await connection.beginTransaction();

        if (normalizedSlotType === "EXAM") {
            if (!examId || !slotId) {
                await connection.rollback();
                return res.status(400).json({
                    ok: false,
                    error: "examId and slotId are required for exam booking"
                });
            }

            const [existingExamBooking] = await connection.query(
                `
                SELECT sr.request_id
                FROM slot_requests sr
                INNER JOIN exam_slot_requests esr
                    ON sr.request_id = esr.request_id
                WHERE sr.student_user_id = ?
                AND esr.exam_id = ?
                AND sr.status IN ('PENDING', 'APPROVED')
                LIMIT 1
                `,
                [studentId, examId]
            );

            if (existingExamBooking.length > 0) {
                await connection.rollback();
                return res.status(409).json({
                    ok: false,
                    error: "You already have an active exam slot request."
                });
            }

            const [slotRows] = await connection.query(
                `
                SELECT
                    ets.slot_id,
                    ets.exam_id,
                    DATE_FORMAT(ets.slot_date, '%Y-%m-%d') AS slot_date,
                    TIME_FORMAT(ets.start_time, '%H:%i') AS start_time,
                    TIME_FORMAT(ets.end_time, '%H:%i') AS end_time,
                    ets.max_machines,
                    ets.is_active,
                    e.exam_name,
                    DATE_FORMAT(e.exam_date, '%Y-%m-%d') AS exam_date,
                    TIME_FORMAT(e.end_time, '%H:%i') AS exam_end_time,
                    e.is_active AS exam_is_active
                FROM exam_time_slots ets
                INNER JOIN exams e
                    ON ets.exam_id = e.exam_id
                WHERE ets.slot_id = ?
                  AND ets.exam_id = ?
                LIMIT 1
                `,
                [slotId, examId]
            );

            if (slotRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    ok: false,
                    error: "Selected exam slot was not found"
                });
            }

            const slotRecord = slotRows[0];

            if (!slotRecord.is_active || !slotRecord.exam_is_active) {
                await connection.rollback();
                return res.status(400).json({
                    ok: false,
                    error: "Selected exam slot is not active"
                });
            }

            const examEndDateTime = buildDateTime(slotRecord.exam_date, slotRecord.exam_end_time);

            if (examEndDateTime && examEndDateTime.getTime() < Date.now()) {
                await connection.rollback();
                return res.status(400).json({
                    ok: false,
                    error: "This exam has already expired"
                });
            }

            if (
                normalizedBookingDate !== slotRecord.slot_date ||
                normalizedStartTime !== slotRecord.start_time ||
                normalizedEndTime !== slotRecord.end_time
            ) {
                await connection.rollback();
                return res.status(400).json({
                    ok: false,
                    error: "Selected slot details do not match the exam slot"
                });
            }

            const [capacityRows] = await connection.query(
                `
                SELECT COUNT(sr.request_id) AS booked_count
                FROM exam_slot_requests esr
                INNER JOIN slot_requests sr
                    ON esr.request_id = sr.request_id
                WHERE esr.slot_id = ?
                  AND sr.status IN ('PENDING', 'APPROVED')
                `,
                [slotId]
            );

            const bookedCount = Number(capacityRows[0]?.booked_count || 0);
            const maxMachines = Number(slotRecord.max_machines || 0);

            if (bookedCount >= maxMachines) {
                await connection.rollback();
                return res.status(409).json({
                    ok: false,
                    error: "This exam slot is already full"
                });
            }
        }

        const [result] = await connection.query(
            `
            INSERT INTO slot_requests
            (
                student_user_id,
                slot_type,
                booking_date,
                start_time,
                end_time,
                status
            )
            VALUES (?, ?, ?, ?, ?, 'PENDING')
            `,
            [
                studentId,
                normalizedSlotType,
                normalizedBookingDate,
                normalizedStartTime,
                normalizedEndTime
            ]
        );

        const requestId = result.insertId;

        if (normalizedSlotType === "PRACTICE") {
            await connection.query(
                `
                INSERT INTO practice_slot_requests
                (request_id, purpose)
                VALUES (?, ?)
                `,
                [requestId, purpose || null]
            );
        }

        if (normalizedSlotType === "EXAM") {
            await connection.query(
                `
                INSERT INTO exam_slot_requests
                (
                    request_id,
                    exam_id,
                    slot_id
                )
                VALUES (?, ?, ?)
                `,
                [requestId, examId, slotId]
            );
        }

        await connection.commit();

        res.status(201).json({
            ok: true,
            message: "Slot request created successfully",
            requestId
        });
    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error("Rollback error:", rollbackError);
        }

        console.error("Create booking error:", error);

        res.status(500).json({
            ok: false,
            error: error.message || "Failed to create booking request"
        });
    } finally {
        connection.release();
    }
});

// ==========================================
// UPDATE STATUS (Admin)
// ==========================================
router.put("/:id/status", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                ok: false,
                error: "Only admins can update status"
            });
        }

        const requestId = req.params.id;
        const { status } = req.body;

        await promisePool.query(
            `
            UPDATE slot_requests
            SET status = ?
            WHERE request_id = ?
            `,
            [status, requestId]
        );

        res.json({
            ok: true,
            message: "Status updated successfully"
        });
    } catch (error) {
        console.error("Update status error:", error);
        res.status(500).json({
            ok: false,
            error: "Failed to update status"
        });
    }
});

// ==========================================
// CANCEL REQUEST
// ==========================================
router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const requestId = req.params.id;

        await promisePool.query(
            `
            UPDATE slot_requests
            SET status = 'CANCELLED'
            WHERE request_id = ?
            `,
            [requestId]
        );

        res.json({
            ok: true,
            message: "Booking cancelled successfully"
        });
    } catch (error) {
        console.error("Cancel booking error:", error);
        res.status(500).json({
            ok: false,
            error: "Failed to cancel booking"
        });
    }
});

module.exports = router;