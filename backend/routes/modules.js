const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

// --------------------------------------------------
// Helpers
// --------------------------------------------------
async function getModuleById(moduleId) {
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
    [moduleId]
  );

  return rows[0] || null;
}

// --------------------------------------------------
// GET all active modules
// --------------------------------------------------
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

    return res.json({
      ok: true,
      modules: rows,
    });
  } catch (error) {
    console.error("Get modules error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch modules",
    });
  }
});

// --------------------------------------------------
// GET one module by id
// --------------------------------------------------
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const module = await getModuleById(req.params.id);

    if (!module || module.is_active === 0 || module.is_active === false) {
      return res.status(404).json({
        ok: false,
        error: "Module not found",
      });
    }

    return res.json({
      ok: true,
      module,
    });
  } catch (error) {
    console.error("Get module by id error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch module",
    });
  }
});

// --------------------------------------------------
// CREATE new module (lecturer only)
// --------------------------------------------------
router.post(
  "/",
  authenticateToken,
  authorizeRole("lecturer"),
  async (req, res) => {
    try {
      const { module_code, module_name, description } = req.body;

      if (!module_code || !module_name) {
        return res.status(400).json({
          ok: false,
          error: "module_code and module_name are required",
        });
      }

      const normalizedCode = String(module_code).trim().toUpperCase();
      const trimmedName = String(module_name).trim();

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
          ok: false,
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
          description ? String(description).trim() : null,
          Number(req.user.id),
        ]
      );

      const module = await getModuleById(result.insertId);

      return res.status(201).json({
        ok: true,
        message: "Module created successfully",
        module,
      });
    } catch (error) {
      console.error("Create module error:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "Server error",
        sqlMessage: error.sqlMessage || null,
        code: error.code || null
      });
    }
  }
);

// --------------------------------------------------
// UPDATE module (lecturer only)
// --------------------------------------------------
router.put(
  "/:id",
  authenticateToken,
  authorizeRole("lecturer"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { module_code, module_name, description, is_active } = req.body;

      const existing = await getModuleById(id);

      if (!existing) {
        return res.status(404).json({
          ok: false,
          error: "Module not found",
        });
      }

      if (Number(existing.created_by) !== Number(req.user.id)) {
        return res.status(403).json({
          ok: false,
          error: "You can only edit modules created by you",
        });
      }

      let finalCode = existing.module_code;

      if (
        module_code &&
        String(module_code).trim().toUpperCase() !== existing.module_code
      ) {
        finalCode = String(module_code).trim().toUpperCase();

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
            ok: false,
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
          module_name ? String(module_name).trim() : existing.module_name,
          description !== undefined
            ? (description ? String(description).trim() : null)
            : existing.description,
          is_active !== undefined ? is_active : existing.is_active,
          id,
        ]
      );

      const module = await getModuleById(id);

      return res.json({
        ok: true,
        message: "Module updated successfully",
        module,
      });
    } catch (error) {
      console.error("Update module error:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "Failed to update module",
      });
    }
  }
);

// --------------------------------------------------
// SOFT DELETE module (lecturer only)
// --------------------------------------------------
router.delete(
  "/:id",
  authenticateToken,
  authorizeRole("lecturer"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await getModuleById(id);

      if (!existing) {
        return res.status(404).json({
          ok: false,
          error: "Module not found",
        });
      }

      if (Number(existing.created_by) !== Number(req.user.id)) {
        return res.status(403).json({
          ok: false,
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

      return res.json({
        ok: true,
        message: "Module deleted successfully",
      });
    } catch (error) {
      console.error("Delete module error:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "Failed to delete module",
      });
    }
  }
);

module.exports = router;