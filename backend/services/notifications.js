const { promisePool } = require("../config/database");

async function createNotification({
    recipientRole,
    recipientId,
    title,
    message,
    notificationType = "system",
    relatedEntityType = null,
    relatedEntityId = null
}) {
    if (!recipientRole || !recipientId || !title || !message) {
        return null;
    }

    const [result] = await promisePool.query(
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
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
            recipientRole,
            recipientId,
            title,
            message,
            notificationType,
            relatedEntityType,
            relatedEntityId
        ]
    );

    return result.insertId;
}

async function notifyAdmins(payload) {
    const [admins] = await promisePool.query(`
        SELECT admin_id
        FROM admins
        WHERE is_active = TRUE
    `);

    for (const admin of admins) {
        await createNotification({
            ...payload,
            recipientRole: "admin",
            recipientId: admin.admin_id
        });
    }
}

module.exports = {
    createNotification,
    notifyAdmins
};
