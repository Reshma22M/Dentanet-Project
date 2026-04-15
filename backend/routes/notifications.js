const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const { createNotification } = require("../services/notifications");

router.get("/:userId", authenticateToken, async (req, res) => {
    try {
        const userId = Number(req.params.userId);

        if (!userId) {
            return res.status(400).json({
                ok: false,
                error: "Invalid user id"
            });
        }

        if (req.user.role !== "admin" && Number(req.user.id) !== userId) {
            return res.status(403).json({
                ok: false,
                error: "Access denied"
            });
        }

        const role = req.user.role === "admin" && Number(req.user.id) !== userId
            ? (req.query.role || "student")
            : req.user.role;

        const [notifications] = await promisePool.query(
            `
            SELECT
                notification_id,
                recipient_role,
                recipient_id,
                title,
                message,
                notification_type,
                is_read,
                related_entity_type,
                related_entity_id,
                created_at
            FROM notifications
            WHERE recipient_role = ?
              AND recipient_id = ?
            ORDER BY created_at DESC
            LIMIT 50
            `,
            [role, userId]
        );

        return res.json({
            ok: true,
            notifications
        });
    } catch (error) {
        console.error("Get notifications error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to fetch notifications"
        });
    }
});

router.put("/:id/read", authenticateToken, async (req, res) => {
    try {
        const notificationId = Number(req.params.id);

        const [rows] = await promisePool.query(
            `
            SELECT recipient_role, recipient_id
            FROM notifications
            WHERE notification_id = ?
            LIMIT 1
            `,
            [notificationId]
        );

        if (!rows.length) {
            return res.status(404).json({
                ok: false,
                error: "Notification not found"
            });
        }

        const notification = rows[0];

        if (
            req.user.role !== "admin" &&
            (notification.recipient_role !== req.user.role || Number(notification.recipient_id) !== Number(req.user.id))
        ) {
            return res.status(403).json({
                ok: false,
                error: "Access denied"
            });
        }

        await promisePool.query(
            `
            UPDATE notifications
            SET is_read = TRUE
            WHERE notification_id = ?
            `,
            [notificationId]
        );

        return res.json({
            ok: true,
            message: "Notification marked as read"
        });
    } catch (error) {
        console.error("Mark notification as read error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to update notification"
        });
    }
});

router.post("/", authenticateToken, async (req, res) => {
    try {
        if (!["admin", "lecturer"].includes(req.user.role)) {
            return res.status(403).json({
                ok: false,
                error: "Only admins and lecturers can create notifications"
            });
        }

        const {
            recipient_role,
            recipient_id,
            title,
            message,
            notification_type,
            related_entity_type,
            related_entity_id
        } = req.body;

        const notificationId = await createNotification({
            recipientRole: recipient_role,
            recipientId: recipient_id,
            title,
            message,
            notificationType: notification_type,
            relatedEntityType: related_entity_type,
            relatedEntityId: related_entity_id
        });

        return res.status(201).json({
            ok: true,
            notificationId
        });
    } catch (error) {
        console.error("Create notification error:", error);
        return res.status(500).json({
            ok: false,
            error: "Failed to create notification"
        });
    }
});

module.exports = router;
