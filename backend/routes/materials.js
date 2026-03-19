const express = require('express');
const router = express.Router();
const { promisePool } = require('../config/database');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Get all study materials (with optional filtering)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { course_id, type } = req.query;
        let query = 'SELECT * FROM study_materials WHERE 1=1';
        const params = [];

        if (course_id) {
            query += ' AND course_id = ?';
            params.push(course_id);
        }

        if (type) {
            query += ' AND type = ?';
            params.push(type);
        }

        query += ' ORDER BY uploaded_at DESC';
        const [materials] = await promisePool.query(query, params);
        
        res.json(materials);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch materials' });
    }
});

// Upload new material (lecturer/admin only)
router.post('/', authenticateToken, authorizeRole('lecturer', 'admin'), async (req, res) => {
    try {
        // Implementation here - requires multer for file upload
        res.status(201).json({ message: 'Material uploaded successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to upload material' });
    }
});

module.exports = router;
