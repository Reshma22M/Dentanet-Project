const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const { createNotification, notifyAdmins } = require("../services/notifications");

/* -------------------------------------------------- */
/* Helpers */
/* -------------------------------------------------- */

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

/* -------------------------------------------------- */
/* GET BOOKINGS */
/* -------------------------------------------------- */

router.get("/", authenticateToken, async (req, res) => {
    try {
        const { module_id, exam_id, status, slot_type } = req.query;

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
                COALESCE(e.module_id, prs.module_id) AS module_id,

                COALESCE(m.module_code, pm.module_code) AS module_code,
                COALESCE(m.module_name, pm.module_name) AS module_name,

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

            LEFT JOIN modules pm
                ON prs.module_id = pm.module_id

            LEFT JOIN modules m
                ON e.module_id = m.module_id

            LEFT JOIN students s
                ON sr.student_user_id = s.student_id

            LEFT JOIN slot_allocations sa
                ON sr.request_id = sa.request_id

            LEFT JOIN lab_machines lm
                ON sa.machine_id = lm.machine_id

            WHERE 1 = 1
        `;

        const params = [];

        if (req.user.role === "student") {
            query += ` AND sr.student_user_id = ?`;
            params.push(req.user.id);
        }

        if (module_id) {
            query += ` AND (e.module_id = ? OR prs.module_id = ?)`;
            params.push(Number(module_id), Number(module_id));
        }

        if (exam_id) {
            query += ` AND esr.exam_id = ?`;
            params.push(Number(exam_id));
        }

        if (status) {
            query += ` AND sr.status = ?`;
            params.push(String(status).toUpperCase());
        }

        if (slot_type) {
            query += ` AND sr.slot_type = ?`;
            params.push(String(slot_type).toUpperCase());
        }

        query += `
            ORDER BY
                sr.booking_date DESC,
                sr.start_time DESC
        `;

        const [rows] = await promisePool.query(query, params);

        return res.json({
            ok: true,
            bookings: rows
        });

    } catch (error) {
        console.error("Get bookings error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to fetch bookings"
        });
    }
});

/* -------------------------------------------------- */
/* CREATE BOOKING */
/* -------------------------------------------------- */

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
            slotId,
            moduleId
        } = req.body;

        const studentId = req.user.id;

        const normalizedSlotType = String(slotType || "").toUpperCase();
        const normalizedBookingDate = normalizeDateOnly(bookingDate);
        const normalizedStartTime = normalizeTimeValue(startTime);
        const normalizedEndTime = normalizeTimeValue(endTime);

        if (
            !normalizedSlotType ||
            !normalizedBookingDate ||
            !normalizedStartTime ||
            !normalizedEndTime
        ) {
            return res.status(400).json({
                ok: false,
                error: "Required fields missing"
            });
        }

        const bookingStart = buildDateTime(normalizedBookingDate, normalizedStartTime);

        if (!bookingStart) {
            return res.status(400).json({
                ok: false,
                error: "Invalid booking date or time"
            });
        }

        if (bookingStart.getTime() < Date.now()) {
            return res.status(400).json({
                ok: false,
                error: "Cannot book past date/time"
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
                  AND sr.slot_type = 'EXAM'
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
                    error: "You already have an active exam slot request"
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
            let practiceModuleId = moduleId ? Number(moduleId) : null;

            if (!practiceModuleId && examId) {
                const [examModuleRows] = await connection.query(
                    `
                    SELECT module_id
                    FROM exams
                    WHERE exam_id = ?
                      AND is_active = TRUE
                    LIMIT 1
                    `,
                    [Number(examId)]
                );

                if (examModuleRows.length > 0) {
                    practiceModuleId = Number(examModuleRows[0].module_id);
                }
            }

            await connection.query(
                `
                INSERT INTO practice_slot_requests
                (request_id, purpose, module_id)
                VALUES (?, ?, ?)
                `,
                [requestId, purpose || null, practiceModuleId || null]
            );

            if (examId) {
                const [examRows] = await connection.query(
                    `
                    SELECT exam_id
                    FROM exams
                    WHERE exam_id = ?
                      AND is_active = TRUE
                    LIMIT 1
                    `,
                    [Number(examId)]
                );

                if (examRows.length > 0) {
                    await connection.query(
                        `
                        INSERT INTO exam_slot_requests
                        (request_id, exam_id, slot_id)
                        VALUES (?, ?, NULL)
                        `,
                        [requestId, Number(examId)]
                    );
                }
            }
        }

        if (normalizedSlotType === "EXAM") {
            await connection.query(
                `
                INSERT INTO exam_slot_requests
                (request_id, exam_id, slot_id)
                VALUES (?, ?, ?)
                `,
                [requestId, examId, slotId]
            );
        }

        await connection.commit();

        const notificationTitle = normalizedSlotType === "EXAM"
            ? "New exam slot request"
            : "New practice slot request";
        const notificationMessage = normalizedSlotType === "EXAM"
            ? "A student requested an exam lab slot that needs admin approval."
            : "A student requested a practice session that needs admin approval.";

        await notifyAdmins({
            title: notificationTitle,
            message: notificationMessage,
            notificationType: "slot_request",
            relatedEntityType: "slot_request",
            relatedEntityId: requestId
        });

        return res.status(201).json({
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

        return res.status(500).json({
            ok: false,
            error: error.message || "Failed to create booking request"
        });
    } finally {
        connection.release();
    }
});

/* -------------------------------------------------- */
/* UPDATE STATUS (Admin only) */
/* -------------------------------------------------- */

router.put("/:id/status", authenticateToken, async (req, res) => {
    const connection = await promisePool.getConnection();

    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                ok: false,
                error: "Only admins can update status"
            });
        }

        const requestId = Number(req.params.id);
        const { status, machineId } = req.body;

        const validStatuses = [
            "PENDING",
            "APPROVED",
            "DENIED",
            "CANCELLED",
            "COMPLETED"
        ];

        const normalizedStatus = String(status || "").toUpperCase();

        if (!validStatuses.includes(normalizedStatus)) {
            return res.status(400).json({
                ok: false,
                error: "Invalid status value"
            });
        }

        const [bookingRows] = await connection.query(
            `
            SELECT
                sr.request_id,
                sr.student_user_id,
                sr.status,
                sr.slot_type,
                esr.slot_id
            FROM slot_requests sr
            LEFT JOIN exam_slot_requests esr
                ON sr.request_id = esr.request_id
            WHERE sr.request_id = ?
            LIMIT 1
            `,
            [requestId]
        );

        if (bookingRows.length === 0) {
            return res.status(404).json({
                ok: false,
                error: "Booking not found"
            });
        }

        const booking = bookingRows[0];
        let studentNotification = null;

        await connection.beginTransaction();

        if (normalizedStatus === "APPROVED") {
            if (!machineId) {
                await connection.rollback();
                return res.status(400).json({
                    ok: false,
                    error: "machineId is required when approving a booking"
                });
            }

            const numericMachineId = Number(machineId);

            const [machineRows] = await connection.query(
                `
                SELECT machine_id, status
                FROM lab_machines
                WHERE machine_id = ?
                LIMIT 1
                `,
                [numericMachineId]
            );

            if (machineRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    ok: false,
                    error: "Selected machine not found"
                });
            }

            if (machineRows[0].status !== "ready") {
                await connection.rollback();
                return res.status(400).json({
                    ok: false,
                    error: "Selected machine is not ready"
                });
            }

            await connection.query(
                `
                INSERT INTO slot_allocations
                (
                    request_id,
                    machine_id,
                    approved_by,
                    approved_at
                )
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE
                    machine_id = VALUES(machine_id),
                    approved_by = VALUES(approved_by),
                    approved_at = CURRENT_TIMESTAMP
                `,
                [requestId, numericMachineId, req.user.id]
            );
        }

        await connection.query(
            `
            UPDATE slot_requests
            SET status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE request_id = ?
            `,
            [normalizedStatus, requestId]
        );

        await connection.commit();

        if (normalizedStatus === "APPROVED") {
            studentNotification = {
                title: "Lab slot approved",
                message: `Your ${String(booking.slot_type || "").toLowerCase()} slot request has been approved.`,
                notificationType: "slot_approval"
            };
        } else if (normalizedStatus === "DENIED" || normalizedStatus === "CANCELLED") {
            studentNotification = {
                title: "Lab slot update",
                message: `Your ${String(booking.slot_type || "").toLowerCase()} slot request was updated to ${normalizedStatus}.`,
                notificationType: "slot_rejection"
            };
        } else if (normalizedStatus === "COMPLETED") {
            studentNotification = {
                title: "Submission portal unlocked",
                message: `Your ${String(booking.slot_type || "").toLowerCase()} slot is marked completed. You can now submit your images.`,
                notificationType: "submission"
            };
        }

        if (studentNotification) {
            await createNotification({
                recipientRole: "student",
                recipientId: booking.student_user_id,
                title: studentNotification.title,
                message: studentNotification.message,
                notificationType: studentNotification.notificationType,
                relatedEntityType: "slot_request",
                relatedEntityId: requestId
            });
        }

        return res.json({
            ok: true,
            message: "Status updated successfully"
        });

    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error("Rollback error:", rollbackError);
        }

        console.error("Update status error:", error);

        return res.status(500).json({
            ok: false,
            error: "Failed to update status"
        });
    } finally {
        connection.release();
    }
});

/* -------------------------------------------------- */
/* CANCEL BOOKING */
/* -------------------------------------------------- */

router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const requestId = Number(req.params.id);

        const [rows] = await promisePool.query(
            `
            SELECT student_user_id
            FROM slot_requests
            WHERE request_id = ?
            `,
            [requestId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                ok: false,
                error: "Booking not found"
            });
        }

        const ownerId = Number(rows[0].student_user_id);

        if (
            req.user.role !== "admin" &&
            Number(req.user.id) !== ownerId
        ) {
            return res.status(403).json({
                ok: false,
                error: "Not authorized to cancel this booking"
            });
        }

        await promisePool.query(
            `
            UPDATE slot_requests
            SET status = 'CANCELLED',
                updated_at = CURRENT_TIMESTAMP
            WHERE request_id = ?
            `,
            [requestId]
        );

        return res.json({
            ok: true,
            message: "Booking cancelled successfully"
        });

    } catch (error) {
        console.error("Cancel booking error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to cancel booking"
        });
    }
});

module.exports = router;
