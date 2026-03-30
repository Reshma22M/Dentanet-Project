const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

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
            success: true,
            bookings: rows
        });
    } catch (error) {
        console.error("Get bookings error:", error);
        res.status(500).json({
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

        if (!slotType || !bookingDate || !startTime || !endTime) {
            return res.status(400).json({
                error: "Required fields missing"
            });
        }

        await connection.beginTransaction();

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
                String(slotType).toUpperCase(),
                bookingDate,
                startTime,
                endTime
            ]
        );

        const requestId = result.insertId;

        if (slotType === "PRACTICE") {
            await connection.query(
                `
                INSERT INTO practice_slot_requests
                (request_id, purpose)
                VALUES (?, ?)
                `,
                [requestId, purpose || null]
            );
        }

        if (slotType === "EXAM") {
            if (!examId || !slotId) {
                await connection.rollback();
                return res.status(400).json({
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
                  AND sr.status IN ('PENDING', 'APPROVED')
                LIMIT 1
                `,
                [studentId]
            );

            if (existingExamBooking.length > 0) {
                await connection.rollback();
                return res.status(409).json({
                    error: "You already have an active exam slot request."
                });
            }

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
            success: true,
            message: "Slot request created successfully",
            requestId
        });
    } catch (error) {
        await connection.rollback();
        console.error("Create booking error:", error);
        res.status(500).json({
            error: "Failed to create booking request"
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
            success: true,
            message: "Status updated successfully"
        });
    } catch (error) {
        console.error("Update status error:", error);
        res.status(500).json({
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
            success: true,
            message: "Booking cancelled successfully"
        });
    } catch (error) {
        console.error("Cancel booking error:", error);
        res.status(500).json({
            error: "Failed to cancel booking"
        });
    }
});

module.exports = router;