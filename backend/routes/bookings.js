const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

// -----------------------------
// Get bookings / slot requests
// -----------------------------
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
                sr.purpose,
                sr.status,
                sr.created_at,
                sr.updated_at,

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
            LEFT JOIN students s ON sr.student_user_id = s.student_id
            LEFT JOIN slot_allocations sa ON sr.request_id = sa.request_id
            LEFT JOIN lab_machines lm ON sa.machine_id = lm.machine_id
        `;

        const params = [];

        if (req.user.role === "student") {
            query += ` WHERE sr.student_user_id = ?`;
            params.push(req.user.id);
        }

        query += ` ORDER BY sr.booking_date DESC, sr.start_time DESC`;

        const [rows] = await promisePool.query(query, params);

        return res.json({
            success: true,
            bookings: rows
        });
    } catch (error) {
        console.error("Get bookings error:", error);
        return res.status(500).json({ error: "Failed to fetch bookings" });
    }
});

// -----------------------------
// Create slot request (student only)
// -----------------------------
router.post("/", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "student") {
            return res.status(403).json({ error: "Only students can create booking requests" });
        }

        const {
            slotType,
            bookingDate,
            startTime,
            endTime,
            purpose
        } = req.body;

        const studentId = req.user.id;

        if (!slotType || !bookingDate || !startTime || !endTime) {
            return res.status(400).json({
                error: "Slot type, booking date, start time and end time are required"
            });
        }

        const allowedTypes = ["PRACTICE", "EXAM"];
        if (!allowedTypes.includes(String(slotType).toUpperCase())) {
            return res.status(400).json({
                error: 'Slot type must be either "PRACTICE" or "EXAM"'
            });
        }

        if (endTime <= startTime) {
            return res.status(400).json({
                error: "End time must be after start time"
            });
        }

        // Student can have only one EXAM request pending/approved for same date+time slot
        if (String(slotType).toUpperCase() === "EXAM") {
            const [existingExam] = await promisePool.query(
                `SELECT request_id
                 FROM slot_requests
                 WHERE student_user_id = ?
                   AND slot_type = 'EXAM'
                   AND status IN ('PENDING', 'APPROVED')
                 LIMIT 1`,
                [studentId]
            );

            if (existingExam.length > 0) {
                return res.status(409).json({
                    error: "You already have an exam slot request."
                });
            }
        }

        // Prevent duplicate overlapping requests by same student
        const [overlapping] = await promisePool.query(
            `SELECT request_id
             FROM slot_requests
             WHERE student_user_id = ?
               AND booking_date = ?
               AND status IN ('PENDING', 'APPROVED')
               AND (
                    (start_time < ? AND end_time > ?)
                 OR (start_time < ? AND end_time > ?)
                 OR (start_time >= ? AND end_time <= ?)
               )`,
            [studentId, bookingDate, endTime, startTime, endTime, startTime, startTime, endTime]
        );

        if (overlapping.length > 0) {
            return res.status(409).json({
                error: "You already have another request overlapping with this time slot."
            });
        }

        const [result] = await promisePool.query(
            `INSERT INTO slot_requests
             (student_user_id, slot_type, booking_date, start_time, end_time, purpose, status)
             VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
            [
                studentId,
                String(slotType).toUpperCase(),
                bookingDate,
                startTime,
                endTime,
                purpose || null
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Slot request submitted successfully",
            requestId: result.insertId,
            status: "PENDING"
        });
    } catch (error) {
        console.error("Create booking error:", error);
        return res.status(500).json({ error: "Failed to create booking request" });
    }
});

// -----------------------------
// Update booking status (admin only)
// Approve / Deny / Cancel / Complete
// If approved, machineId is required and allocation is created
// -----------------------------
router.put("/:id/status", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ error: "Only admins can update booking status" });
        }

        const requestId = parseInt(req.params.id, 10);
        const { status, machineId } = req.body;

        if (isNaN(requestId)) {
            return res.status(400).json({ error: "Invalid request id" });
        }

        const normalizedStatus = String(status || "").toUpperCase();

        const allowedStatuses = ["APPROVED", "DENIED", "CANCELLED", "COMPLETED"];
        if (!allowedStatuses.includes(normalizedStatus)) {
            return res.status(400).json({
                error: 'Status must be one of "APPROVED", "DENIED", "CANCELLED", "COMPLETED"'
            });
        }

        const [requests] = await promisePool.query(
            `SELECT * FROM slot_requests WHERE request_id = ? LIMIT 1`,
            [requestId]
        );

        if (requests.length === 0) {
            return res.status(404).json({ error: "Slot request not found" });
        }

        const request = requests[0];

        if (normalizedStatus === "APPROVED") {
            if (!machineId) {
                return res.status(400).json({
                    error: "Machine ID is required when approving a request"
                });
            }

            const [machines] = await promisePool.query(
                `SELECT * FROM lab_machines WHERE machine_id = ? LIMIT 1`,
                [machineId]
            );

            if (machines.length === 0) {
                return res.status(404).json({ error: "Machine not found" });
            }

            const machine = machines[0];

            if (machine.status !== "ready") {
                return res.status(400).json({
                    error: `Machine is not available. Current status: ${machine.status}`
                });
            }

            // Check overlapping approved allocations on same machine
            const [conflicts] = await promisePool.query(
                `SELECT sa.allocation_id
                 FROM slot_allocations sa
                 JOIN slot_requests sr ON sa.request_id = sr.request_id
                 WHERE sa.machine_id = ?
                   AND sr.booking_date = ?
                   AND sr.status = 'APPROVED'
                   AND sr.request_id <> ?
                   AND (
                        (sr.start_time < ? AND sr.end_time > ?)
                     OR (sr.start_time < ? AND sr.end_time > ?)
                     OR (sr.start_time >= ? AND sr.end_time <= ?)
                   )`,
                [
                    machineId,
                    request.booking_date,
                    requestId,
                    request.end_time,
                    request.start_time,
                    request.end_time,
                    request.start_time,
                    request.start_time,
                    request.end_time
                ]
            );

            if (conflicts.length > 0) {
                return res.status(409).json({
                    error: "This machine is already allocated for the selected time slot"
                });
            }

            await promisePool.query(
                `UPDATE slot_requests
                 SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
                 WHERE request_id = ?`,
                [requestId]
            );

            const [existingAllocation] = await promisePool.query(
                `SELECT allocation_id FROM slot_allocations WHERE request_id = ? LIMIT 1`,
                [requestId]
            );

            if (existingAllocation.length === 0) {
                await promisePool.query(
                    `INSERT INTO slot_allocations
                     (request_id, machine_id, approved_by, approved_at)
                     VALUES (?, ?, ?, NOW())`,
                    [requestId, machineId, req.user.id]
                );
            } else {
                await promisePool.query(
                    `UPDATE slot_allocations
                     SET machine_id = ?, approved_by = ?, approved_at = NOW()
                     WHERE request_id = ?`,
                    [machineId, req.user.id, requestId]
                );
            }

            return res.json({
                success: true,
                message: "Slot request approved successfully"
            });
        }

        // For denied/cancelled/completed
        await promisePool.query(
            `UPDATE slot_requests
             SET status = ?, updated_at = CURRENT_TIMESTAMP
             WHERE request_id = ?`,
            [normalizedStatus, requestId]
        );

        return res.json({
            success: true,
            message: `Slot request ${normalizedStatus.toLowerCase()} successfully`
        });
    } catch (error) {
        console.error("Update booking status error:", error);
        return res.status(500).json({ error: "Failed to update booking status" });
    }
});

// -----------------------------
// Cancel own booking request (student) OR admin cancel
// -----------------------------
router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const requestId = parseInt(req.params.id, 10);

        if (isNaN(requestId)) {
            return res.status(400).json({ error: "Invalid request id" });
        }

        const [requests] = await promisePool.query(
            `SELECT * FROM slot_requests WHERE request_id = ? LIMIT 1`,
            [requestId]
        );

        if (requests.length === 0) {
            return res.status(404).json({ error: "Slot request not found" });
        }

        const request = requests[0];

        if (req.user.role === "student" && request.student_user_id !== req.user.id) {
            return res.status(403).json({ error: "Access denied" });
        }

        await promisePool.query(
            `UPDATE slot_requests
             SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
             WHERE request_id = ?`,
            [requestId]
        );

        return res.json({
            success: true,
            message: "Booking cancelled successfully"
        });
    } catch (error) {
        console.error("Cancel booking error:", error);
        return res.status(500).json({ error: "Failed to cancel booking" });
    }
});

module.exports = router;