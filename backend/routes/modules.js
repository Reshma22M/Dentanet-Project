const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

// Get all active modules
router.get("/", authenticateToken, async (req, res) => {
  try {
    const [rows] = await promisePool.query(
      `
      SELECT
        module_id,
        module_code,
        module_name,
        description,
        created_by,
        is_active,
        created_at,
        updated_at
      FROM modules
      WHERE is_active = TRUE
      ORDER BY module_name ASC
      `
    );

    res.json(rows);
  } catch (error) {
    console.error("Get modules error:", error);
    res.status(500).json({ error: "Failed to fetch modules" });
  }
});

// Get one module by id
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await promisePool.query(
      `
      SELECT
        module_id,
        module_code,
        module_name,
        description,
        created_by,
        is_active,
        created_at,
        updated_at
      FROM modules
      WHERE module_id = ? AND is_active = TRUE
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Module not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Get module by id error:", error);
    res.status(500).json({ error: "Failed to fetch module" });
  }
});

// Create new module (lecturer only)
router.post("/", authenticateToken, authorizeRole("lecturer"), async (req, res) => {
  try {
    const { module_code, module_name, description } = req.body;

    if (!module_code || !module_name) {
      return res.status(400).json({
        error: "module_code and module_name are required",
      });
    }

    const normalizedCode = module_code.trim().toUpperCase();
    const trimmedName = module_name.trim();

    const [existingRows] = await promisePool.query(
      `
      SELECT module_id
      FROM modules
      WHERE module_code = ?
      LIMIT 1
      `,
      [normalizedCode]
    );

    if (existingRows.length > 0) {
      return res.status(409).json({
        error: "A module with this code already exists",
      });
    }

    const [result] = await promisePool.query(
      `
      INSERT INTO modules (
        module_code,
        module_name,
        description,
        created_by,
        is_active
      )
      VALUES (?, ?, ?, ?, TRUE)
      `,
      [
        normalizedCode,
        trimmedName,
        description ? description.trim() : null,
        req.user.id,
      ]
    );

    const [rows] = await promisePool.query(
      `
      SELECT
        module_id,
        module_code,
        module_name,
        description,
        created_by,
        is_active,
        created_at,
        updated_at
      FROM modules
      WHERE module_id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    res.status(201).json({
      message: "Module created successfully",
      module: rows[0],
    });
  } catch (error) {
    console.error("Create module error:", error);
    res.status(500).json({ error: "Failed to create module" });
  }
});

// Update module (lecturer only)
router.put("/:id", authenticateToken, authorizeRole("lecturer"), async (req, res) => {
  try {
    const { id } = req.params;
    const { module_code, module_name, description, is_active } = req.body;

    const [existingRows] = await promisePool.query(
      `
      SELECT *
      FROM modules
      WHERE module_id = ?
      LIMIT 1
      `,
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Module not found" });
    }

    const existing = existingRows[0];

    if (existing.created_by !== req.user.id) {
      return res.status(403).json({
        error: "You can only edit modules created by you",
      });
    }

    let finalCode = existing.module_code;
    if (module_code && module_code.trim().toUpperCase() !== existing.module_code) {
      finalCode = module_code.trim().toUpperCase();

      const [duplicateRows] = await promisePool.query(
        `
        SELECT module_id
        FROM modules
        WHERE module_code = ? AND module_id <> ?
        LIMIT 1
        `,
        [finalCode, id]
      );

      if (duplicateRows.length > 0) {
        return res.status(409).json({
          error: "Another module with this code already exists",
        });
      }
    }

    await promisePool.query(
      `
      UPDATE modules
      SET
        module_code = ?,
        module_name = ?,
        description = ?,
        is_active = ?
      WHERE module_id = ?
      `,
      [
        finalCode,
        module_name ? module_name.trim() : existing.module_name,
        description !== undefined ? (description ? description.trim() : null) : existing.description,
        is_active !== undefined ? is_active : existing.is_active,
        id,
      ]
    );

    const [updatedRows] = await promisePool.query(
      `
      SELECT
        module_id,
        module_code,
        module_name,
        description,
        created_by,
        is_active,
        created_at,
        updated_at
      FROM modules
      WHERE module_id = ?
      LIMIT 1
      `,
      [id]
    );

    res.json({
      message: "Module updated successfully",
      module: updatedRows[0],
    });
  } catch (error) {
    console.error("Update module error:", error);
    res.status(500).json({ error: "Failed to update module" });
  }
});

// Soft delete module (lecturer only)
router.delete("/:id", authenticateToken, authorizeRole("lecturer"), async (req, res) => {
  try {
    const { id } = req.params;

    const [existingRows] = await promisePool.query(
      `
      SELECT *
      FROM modules
      WHERE module_id = ?
      LIMIT 1
      `,
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Module not found" });
    }

    const existing = existingRows[0];

    if (existing.created_by !== req.user.id) {
      return res.status(403).json({
        error: "You can only delete modules created by you",
      });
    }

    await promisePool.query(
      `
      UPDATE modules
      SET is_active = FALSE
      WHERE module_id = ?
      `,
      [id]
    );

    res.json({ message: "Module deleted successfully" });
  } catch (error) {
    console.error("Delete module error:", error);
    res.status(500).json({ error: "Failed to delete module" });
  }
});

module.exports = router;