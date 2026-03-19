const express = require('express');
const router = express.Router();
const { promisePool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get user notifications
router.get('/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Users can only see their own notifications
        if (req.user.userId !== parseInt(userId) && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const [notifications] = await promisePool.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [userId]
        );
        
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark notification as read
router.put('/:id/read', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        await promisePool.query(
            'UPDATE notifications SET is_read = TRUE WHERE notification_id = ?',
            [id]
        );
        
        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// Create notification (admin/lecturer only)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { user_id, type, title, message } = req.body;
        
        const [result] = await promisePool.query(
            'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
            [user_id, type, title, message]
        );
        
        res.status(201).json({ 
            message: 'Notification created',
            notificationId: result.insertId 
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create notification' });
    }
});

module.exports = router;
