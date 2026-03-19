const express = require('express');
const router = express.Router();
const { promisePool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateExamFile, isExamDeadlinePassed } = require('../middleware/validators');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/exam-submissions/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'exam-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 100 * 1024 * 1024 // 100MB max file size
    },
    fileFilter: (req, file, cb) => {
        // Only allow jpg, png, pdf
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, PNG, and PDF files are allowed'));
        }
    }
});

// Get submissions (students see their own, lecturers see all)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const role = req.user.role;

        let query;
        let params;

        if (role === 'student') {
            // Students see only their own submissions
            query = `
                SELECT es.*, e.exam_name, e.exam_type, e.max_attempts, 
                       c.course_name, c.course_code,
                       COUNT(DISTINCT si.image_id) as image_count,
                       ae.final_grade as ai_grade, ae.ai_comment,
                       le.final_grade as lecturer_grade, le.lecturer_feedback, le.evaluation_status
                FROM exam_submissions es
                JOIN exams e ON es.exam_id = e.exam_id
                JOIN courses c ON e.course_id = c.course_id
                LEFT JOIN submission_images si ON es.submission_id = si.submission_id
                LEFT JOIN ai_evaluations ae ON es.submission_id = ae.submission_id
                LEFT JOIN lecturer_evaluations le ON es.submission_id = le.submission_id
                WHERE es.student_id = ?
                GROUP BY es.submission_id
                ORDER BY es.submission_date DESC
            `;
            params = [userId];
        } else if (role === 'lecturer' || role === 'admin') {
            // Lecturers and admins see all submissions
            query = `
                SELECT es.*, e.exam_name, e.exam_type, e.max_attempts,
                       c.course_name, c.course_code,
                      CONCAT(s.first_name, ' ', s.last_name) as student_name, s.email as student_email,
                          s.registration_number,
                       COUNT(DISTINCT si.image_id) as image_count,
                       ae.final_grade as ai_grade, ae.ai_comment,
                       le.final_grade as lecturer_grade, le.lecturer_feedback, le.evaluation_status
                FROM exam_submissions es
                JOIN exams e ON es.exam_id = e.exam_id
                JOIN courses c ON e.course_id = c.course_id
                JOIN students s ON es.student_id = s.student_id
                LEFT JOIN submission_images si ON es.submission_id = si.submission_id
                LEFT JOIN ai_evaluations ae ON es.submission_id = ae.submission_id
                LEFT JOIN lecturer_evaluations le ON es.submission_id = le.submission_id
                GROUP BY es.submission_id
                ORDER BY es.submission_date DESC
            `;
            params = [];
        } else {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const [submissions] = await promisePool.query(query, params);

        res.json({ submissions });
    } catch (error) {
        console.error('Fetch submissions error:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

// Create submission with validations
router.post('/', authenticateToken, upload.array('images', 10), async (req, res) => {
    try {
        const userId = req.user.userId;
        const { examId, caseDescription } = req.body;
        const files = req.files;

        // Validate required fields
        if (!examId) {
            return res.status(400).json({ error: 'Exam ID is required' });
        }

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'At least one image/file is required' });
        }

        // Get exam details
        const [exams] = await promisePool.query(
            `SELECT e.*, e.exam_date, e.duration_minutes, e.max_attempts 
             FROM exams e 
             WHERE e.exam_id = ?`,
            [examId]
        );

        if (exams.length === 0) {
            return res.status(404).json({ error: 'Exam not found' });
        }

        const exam = exams[0];

        // Check if deadline has passed (exam_date + duration + 2 hours buffer)
        if (exam.exam_date && exam.duration_minutes) {
            const deadlinePassed = isExamDeadlinePassed(exam.exam_date, exam.duration_minutes);
            if (deadlinePassed) {
                return res.status(403).json({ 
                    error: 'Exam deadline has passed. Submissions are no longer accepted.' 
                });
            }
        }

        // Check if student has exceeded max attempts
        const [existingSubmissions] = await promisePool.query(
            'SELECT COUNT(*) as attempt_count FROM exam_submissions WHERE exam_id = ? AND student_id = ?',
            [examId, userId]
        );

        const currentAttempts = existingSubmissions[0].attempt_count;

        if (currentAttempts >= exam.max_attempts) {
            return res.status(403).json({ 
                error: `Maximum number of attempts (${exam.max_attempts}) exceeded` 
            });
        }

        const attemptNumber = currentAttempts + 1;

        // Validate each file
        for (const file of files) {
            const validation = validateExamFile(file);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }
        }

        // Create submission
        const [submissionResult] = await promisePool.query(
            `INSERT INTO exam_submissions 
             (exam_id, student_id, attempt_number, case_description, status) 
             VALUES (?, ?, ?, ?, 'pending')`,
            [examId, userId, attemptNumber, caseDescription || null]
        );

        const submissionId = submissionResult.insertId;

        // Insert submission images/files
        for (const file of files) {
            await promisePool.query(
                'INSERT INTO submission_images (submission_id, image_url, image_type) VALUES (?, ?, ?)',
                [submissionId, file.path, file.mimetype]
            );
        }

        console.log(`✅ Submission created: Exam ${examId}, Student ${userId}, Attempt ${attemptNumber}`);

        res.status(201).json({ 
            message: 'Submission created successfully',
            submissionId: submissionId,
            attemptNumber: attemptNumber,
            filesUploaded: files.length
        });

    } catch (error) {
        console.error('Create submission error:', error);
        res.status(500).json({ error: 'Failed to create submission' });
    }
});

module.exports = router;
