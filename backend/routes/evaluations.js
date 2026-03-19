const express = require('express');
const router = express.Router();
const { promisePool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Submit AI evaluation
router.post('/ai', authenticateToken, async (req, res) => {
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

        // Validate required fields
        if (!submission_id || !final_grade || !smooth_outline_status || 
            !flat_floor_status || !depth_status || !undercut_status) {
            return res.status(400).json({ 
                error: 'Missing required fields: submission_id, final_grade, and all feature statuses' 
            });
        }

        // Insert AI evaluation
        const [result] = await promisePool.query(
            `INSERT INTO ai_evaluations 
            (submission_id, final_grade, ai_comment, smooth_outline_status, 
             flat_floor_status, depth_status, undercut_status, processing_time_seconds) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [submission_id, final_grade, ai_comment, smooth_outline_status, 
             flat_floor_status, depth_status, undercut_status, processing_time_seconds]
        );

        // Update submission status
        await promisePool.query(
            'UPDATE exam_submissions SET status = ? WHERE submission_id = ?',
            ['evaluated', submission_id]
        );

        res.status(201).json({ 
            message: 'AI evaluation submitted successfully',
            ai_evaluation_id: result.insertId
        });
    } catch (error) {
        console.error('AI evaluation error:', error);
        res.status(500).json({ error: 'Failed to submit AI evaluation' });
    }
});

// Get AI evaluation by submission ID
router.get('/ai/:submissionId', authenticateToken, async (req, res) => {
    try {
        const { submissionId } = req.params;

        const [evaluations] = await promisePool.query(
            `SELECT * FROM ai_evaluations WHERE submission_id = ?`,
            [submissionId]
        );

        if (evaluations.length === 0) {
            return res.status(404).json({ error: 'AI evaluation not found' });
        }

        res.json(evaluations[0]);
    } catch (error) {
        console.error('Get AI evaluation error:', error);
        res.status(500).json({ error: 'Failed to fetch AI evaluation' });
    }
});

// Submit lecturer evaluation
router.post('/lecturer', authenticateToken, async (req, res) => {
    try {
        const { 
            submission_id, 
            lecturer_grade, 
            feedback,
            override_ai
        } = req.body;

        if (!submission_id || !lecturer_grade) {
            return res.status(400).json({ 
                error: 'Missing required fields: submission_id and lecturer_grade' 
            });
        }

        const [result] = await promisePool.query(
            `INSERT INTO lecturer_evaluations 
            (submission_id, lecturer_id, lecturer_grade, feedback, override_ai) 
            VALUES (?, ?, ?, ?, ?)`,
            [submission_id, req.user.userId, lecturer_grade, feedback, override_ai || false]
        );

        // Update submission with final grade
        await promisePool.query(
            'UPDATE exam_submissions SET final_grade = ?, status = ? WHERE submission_id = ?',
            [lecturer_grade, 'graded', submission_id]
        );

        res.status(201).json({ 
            message: 'Lecturer evaluation submitted successfully',
            evaluation_id: result.insertId
        });
    } catch (error) {
        console.error('Lecturer evaluation error:', error);
        res.status(500).json({ error: 'Failed to submit lecturer evaluation' });
    }
});

// Get evaluation details (AI + Lecturer) for a submission
router.get('/:submissionId', authenticateToken, async (req, res) => {
    try {
        const { submissionId } = req.params;

        // Get AI evaluation
        const [aiEval] = await promisePool.query(
            'SELECT * FROM ai_evaluations WHERE submission_id = ?',
            [submissionId]
        );

        // Get lecturer evaluation
        const [lecturerEval] = await promisePool.query(
            `SELECT le.*, l.first_name, l.last_name 
             FROM lecturer_evaluations le
             JOIN lecturers l ON le.lecturer_id = l.lecturer_id
             WHERE le.submission_id = ?`,
            [submissionId]
        );

        res.json({
            ai_evaluation: aiEval[0] || null,
            lecturer_evaluation: lecturerEval[0] || null
        });
    } catch (error) {
        console.error('Get evaluations error:', error);
        res.status(500).json({ error: 'Failed to fetch evaluations' });
    }
});

module.exports = router;
