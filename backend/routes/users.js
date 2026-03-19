const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

// -----------------------------
// Helper: check if requester owns this account
// -----------------------------
function isOwnAccount(req, id) {
    return Number(req.user.id) === Number(id);
}

// -----------------------------
// Get all accounts (admin only)
// Unified view across admins, students, lecturers
// -----------------------------
router.get("/", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ error: "Access denied" });
        }

        const [rows] = await promisePool.query(`
            SELECT id, account_type, email, first_name, last_name, identifier, is_active, created_at
            FROM (
                SELECT 
                    admin_id AS id,
                    'admin' AS account_type,
                    email,
                    first_name,
                    last_name,
                    NULL AS identifier,
                    is_active,
                    created_at
                FROM admins

                UNION ALL

                SELECT 
                    student_id AS id,
                    'student' AS account_type,
                    email,
                    first_name,
                    last_name,
                    registration_number AS identifier,
                    is_active,
                    created_at
                FROM students

                UNION ALL

                SELECT 
                    lecturer_id AS id,
                    'lecturer' AS account_type,
                    email,
                    first_name,
                    last_name,
                    staff_id AS identifier,
                    is_active,
                    created_at
                FROM lecturers
            ) t
            ORDER BY created_at DESC
        `);

        return res.json({
            success: true,
            users: rows
        });
    } catch (error) {
        console.error("Get users error:", error);
        return res.status(500).json({ error: "Failed to fetch users" });
    }
});

// -----------------------------
// Get current logged-in user's own profile
// -----------------------------
router.get("/me", authenticateToken, async (req, res) => {
    try {
        const { id, role } = req.user;

        if (role === "admin") {
            const [rows] = await promisePool.query(
                `SELECT 
                    admin_id AS id,
                    email,
                    first_name,
                    last_name,
                    is_active,
                    created_at,
                    'admin' AS account_type
                 FROM admins
                 WHERE admin_id = ?
                 LIMIT 1`,
                [id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: "User not found" });
            }

            return res.json({ success: true, user: rows[0] });
        }

        if (role === "student") {
            const [rows] = await promisePool.query(
                `SELECT 
                    s.student_id AS id,
                    s.email,
                    s.first_name,
                    s.last_name,
                    s.registration_number,
                    s.department_id,
                    d.department_name,
                    s.is_active,
                    s.created_at,
                    'student' AS account_type
                 FROM students s
                 LEFT JOIN departments d ON s.department_id = d.department_id
                 WHERE s.student_id = ?
                 LIMIT 1`,
                [id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: "User not found" });
            }

            return res.json({ success: true, user: rows[0] });
        }

        if (role === "lecturer") {
            const [rows] = await promisePool.query(
                `SELECT 
                    l.lecturer_id AS id,
                    l.email,
                    l.first_name,
                    l.last_name,
                    l.staff_id,
                    l.department_id,
                    d.department_name,
                    l.is_active,
                    l.created_at,
                    'lecturer' AS account_type
                 FROM lecturers l
                 LEFT JOIN departments d ON l.department_id = d.department_id
                 WHERE l.lecturer_id = ?
                 LIMIT 1`,
                [id]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: "User not found" });
            }

            return res.json({ success: true, user: rows[0] });
        }

        return res.status(400).json({ error: "Invalid role" });
    } catch (error) {
        console.error("Get current user error:", error);
        return res.status(500).json({ error: "Failed to fetch user" });
    }
});

// -----------------------------
// Get user by ID
// Admin can access anyone
// Non-admin can only access own account by ID
// -----------------------------
router.get("/:id", authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid id" });
        }

        if (req.user.role !== "admin" && !isOwnAccount(req, id)) {
            return res.status(403).json({ error: "Access denied" });
        }

        const [a] = await promisePool.query(
            `SELECT 
                admin_id AS id,
                email,
                first_name,
                last_name,
                is_active,
                created_at,
                'admin' AS account_type
             FROM admins
             WHERE admin_id = ?
             LIMIT 1`,
            [id]
        );
        if (a.length > 0) {
            return res.json({ success: true, user: a[0] });
        }

        const [s] = await promisePool.query(
            `SELECT 
                s.student_id AS id,
                s.email,
                s.first_name,
                s.last_name,
                s.registration_number,
                s.department_id,
                d.department_name,
                s.is_active,
                s.created_at,
                'student' AS account_type
             FROM students s
             LEFT JOIN departments d ON s.department_id = d.department_id
             WHERE s.student_id = ?
             LIMIT 1`,
            [id]
        );
        if (s.length > 0) {
            return res.json({ success: true, user: s[0] });
        }

        const [l] = await promisePool.query(
            `SELECT 
                l.lecturer_id AS id,
                l.email,
                l.first_name,
                l.last_name,
                l.staff_id,
                l.department_id,
                d.department_name,
                l.is_active,
                l.created_at,
                'lecturer' AS account_type
             FROM lecturers l
             LEFT JOIN departments d ON l.department_id = d.department_id
             WHERE l.lecturer_id = ?
             LIMIT 1`,
            [id]
        );
        if (l.length > 0) {
            return res.json({ success: true, user: l[0] });
        }

        return res.status(404).json({ error: "User not found" });
    } catch (error) {
        console.error("Get user error:", error);
        return res.status(500).json({ error: "Failed to fetch user" });
    }
});

// -----------------------------
// Update own profile (or admin updates any)
// Only updates name fields for now
// -----------------------------
router.put("/:id", authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { firstName, lastName } = req.body;

        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid id" });
        }

        if (!firstName || !lastName) {
            return res.status(400).json({ error: "First name and last name are required" });
        }

        if (req.user.role !== "admin" && !isOwnAccount(req, id)) {
            return res.status(403).json({ error: "Access denied" });
        }

        const [ua] = await promisePool.query(
            "UPDATE admins SET first_name = ?, last_name = ? WHERE admin_id = ?",
            [firstName, lastName, id]
        );
        if (ua.affectedRows > 0) {
            return res.json({ success: true, message: "User updated successfully" });
        }

        const [us] = await promisePool.query(
            "UPDATE students SET first_name = ?, last_name = ? WHERE student_id = ?",
            [firstName, lastName, id]
        );
        if (us.affectedRows > 0) {
            return res.json({ success: true, message: "User updated successfully" });
        }

        const [ul] = await promisePool.query(
            "UPDATE lecturers SET first_name = ?, last_name = ? WHERE lecturer_id = ?",
            [firstName, lastName, id]
        );
        if (ul.affectedRows > 0) {
            return res.json({ success: true, message: "User updated successfully" });
        }

        return res.status(404).json({ error: "User not found" });
    } catch (error) {
        console.error("Update user error:", error);
        return res.status(500).json({ error: "Failed to update user" });
    }
});

// -----------------------------
// Deactivate user (admin only)
// -----------------------------
router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (isNaN(id)) {
            return res.status(400).json({ error: "Invalid id" });
        }

        if (req.user.role !== "admin") {
            return res.status(403).json({ error: "Access denied" });
        }

        const [da] = await promisePool.query(
            "UPDATE admins SET is_active = FALSE WHERE admin_id = ?",
            [id]
        );
        if (da.affectedRows > 0) {
            return res.json({ success: true, message: "Account deactivated successfully" });
        }

        const [ds] = await promisePool.query(
            "UPDATE students SET is_active = FALSE WHERE student_id = ?",
            [id]
        );
        if (ds.affectedRows > 0) {
            return res.json({ success: true, message: "Account deactivated successfully" });
        }

        const [dl] = await promisePool.query(
            "UPDATE lecturers SET is_active = FALSE WHERE lecturer_id = ?",
            [id]
        );
        if (dl.affectedRows > 0) {
            return res.json({ success: true, message: "Account deactivated successfully" });
        }

        return res.status(404).json({ error: "User not found" });
    } catch (error) {
        console.error("Delete user error:", error);
        return res.status(500).json({ error: "Failed to deactivate user" });
    }
});

module.exports = router;