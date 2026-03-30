const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

function normalizeDateOnly(value) {
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString().split("T")[0];
}

// Get all machines
router.get("/", authenticateToken, async (req, res) => {
    try {
        const [rows] = await promisePool.query(`
            SELECT
                machine_id,
                machine_code,
                lab_number,
                status,
                DATE_FORMAT(last_maintenance_date, '%Y-%m-%d') AS last_maintenance_date,
                created_at,
                updated_at
            FROM lab_machines
            ORDER BY machine_id ASC
        `);

        res.json({
            ok: true,
            machines: rows
        });
    } catch (error) {
        console.error("Get machines error:", error);
        res.status(500).json({
            ok: false,
            error: "Failed to fetch machines"
        });
    }
});

// Create machine
router.post("/", authenticateToken, authorizeRole("admin"), async (req, res) => {
    try {
        const {
            machine_code,
            lab_number,
            status,
            last_maintenance_date
        } = req.body;

        if (!machine_code || !lab_number) {
            return res.status(400).json({
                ok: false,
                error: "machine_code and lab_number are required"
            });
        }

        const formattedDate = normalizeDateOnly(last_maintenance_date);

        const [result] = await promisePool.query(`
            INSERT INTO lab_machines
            (
                machine_code,
                lab_number,
                status,
                last_maintenance_date
            )
            VALUES (?, ?, ?, ?)
        `, [
            machine_code.trim(),
            lab_number.trim(),
            status || "ready",
            formattedDate
        ]);

        const [rows] = await promisePool.query(`
            SELECT
                machine_id,
                machine_code,
                lab_number,
                status,
                DATE_FORMAT(last_maintenance_date, '%Y-%m-%d') AS last_maintenance_date,
                created_at,
                updated_at
            FROM lab_machines
            WHERE machine_id = ?
            LIMIT 1
        `, [result.insertId]);

        res.status(201).json({
            ok: true,
            message: "Machine created successfully",
            machine: rows[0]
        });
    } catch (error) {
        console.error("Create machine error:", error);
        res.status(500).json({
            ok: false,
            error: error.message || "Failed to create machine"
        });
    }
});

// Update machine
router.put("/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
    try {
        const machineId = Number(req.params.id);

        const {
            machine_code,
            lab_number,
            status,
            last_maintenance_date
        } = req.body;

        if (!machineId) {
            return res.status(400).json({
                ok: false,
                error: "Invalid machine id"
            });
        }

        if (!machine_code || !lab_number || !status) {
            return res.status(400).json({
                ok: false,
                error: "machine_code, lab_number and status are required"
            });
        }

        const formattedDate = normalizeDateOnly(last_maintenance_date);

        await promisePool.query(`
            UPDATE lab_machines
            SET
                machine_code = ?,
                lab_number = ?,
                status = ?,
                last_maintenance_date = ?
            WHERE machine_id = ?
        `, [
            machine_code.trim(),
            lab_number.trim(),
            status,
            formattedDate,
            machineId
        ]);

        const [rows] = await promisePool.query(`
            SELECT
                machine_id,
                machine_code,
                lab_number,
                status,
                DATE_FORMAT(last_maintenance_date, '%Y-%m-%d') AS last_maintenance_date,
                created_at,
                updated_at
            FROM lab_machines
            WHERE machine_id = ?
            LIMIT 1
        `, [machineId]);

        res.json({
            ok: true,
            message: "Machine updated successfully",
            machine: rows[0]
        });
    } catch (error) {
        console.error("Update machine error:", error);
        res.status(500).json({
            ok: false,
            error: error.message || "Failed to update machine"
        });
    }
});

module.exports = router;