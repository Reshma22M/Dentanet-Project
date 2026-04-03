const express = require("express");
const router = express.Router();

const { promisePool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

// ======================================================
// GET ALL MODULES
// ======================================================
router.get("/", authenticateToken, async (req, res) => {
  try {
    const [rows] = await promisePool.query(`
      SELECT
        m.module_id,
        m.module_name,
        m.module_code,
        m.description,
        m.module_image_url,
        m.is_active,
        m.created_at,
        m.updated_at,

        a.first_name AS admin_first_name,
        a.last_name AS admin_last_name

      FROM modules m
      LEFT JOIN admins a
        ON m.created_by = a.admin_id
      WHERE m.is_active = TRUE
      ORDER BY m.created_at DESC
    `);

    return res.json({
      ok: true,
      modules: rows
    });
  } catch (error) {
    console.error("Get modules error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch modules"
    });
  }
});


// ======================================================
// GET MODULE MEMBERS
// ======================================================
router.get("/:id/members", authenticateToken, async (req, res) => {
  try {
    const moduleId = req.params.id;

    // Check if module exists
    const [moduleExists] = await promisePool.query(
      `SELECT module_id FROM modules WHERE module_id = ? AND is_active = TRUE`,
      [moduleId]
    );

    if (moduleExists.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Module not found"
      });
    }

    const [students] = await promisePool.query(`
      SELECT
        s.student_id,
        s.first_name,
        s.last_name,
        s.email,
        s.registration_number
      FROM module_students ms
      JOIN students s
        ON ms.student_id = s.student_id
      WHERE ms.module_id = ? AND ms.is_active = TRUE
    `, [moduleId]);

    const [lecturers] = await promisePool.query(`
      SELECT
        l.lecturer_id,
        l.first_name,
        l.last_name,
        l.email,
        l.staff_id
      FROM module_lecturers ml
      JOIN lecturers l
        ON ml.lecturer_id = l.lecturer_id
      WHERE ml.module_id = ? AND ml.is_active = TRUE
    `, [moduleId]);

    res.json({
      ok: true,
      students,
      lecturers
    });
  } catch (error) {
    console.error("Get module members error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch module members"
    });
  }
});

// ======================================================
// GET MODULE BY ID
// ======================================================
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const moduleId = Number(req.params.id);

    const [rows] = await promisePool.query(`
      SELECT
        m.module_id,
        m.module_name,
        m.module_code,
        m.description,
        m.module_image_url,
        m.is_active,
        m.created_at,
        m.updated_at,

        a.first_name AS admin_first_name,
        a.last_name AS admin_last_name

      FROM modules m
      LEFT JOIN admins a
        ON m.created_by = a.admin_id
      WHERE m.module_id = ?
      LIMIT 1
    `, [moduleId]);

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Module not found"
      });
    }

    return res.json({
      ok: true,
      module: rows[0]
    });
  } catch (error) {
    console.error("Get module error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch module"
    });
  }
});

// ======================================================
// CREATE MODULE (ADMIN ONLY)
// ======================================================
router.post("/", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        ok: false,
        error: "Only admins can create modules"
      });
    }

    const {
      module_name,
      module_code,
      description,
      module_image_url
    } = req.body;

    if (!module_name || !module_code) {
      return res.status(400).json({
        ok: false,
        error: "Module name and code are required"
      });
    }

    const normalizedCode = String(module_code).trim().toUpperCase();
    const normalizedName = String(module_name).trim();

    const [duplicateRows] = await promisePool.query(
      `SELECT module_id FROM modules WHERE module_code = ? LIMIT 1`,
      [normalizedCode]
    );

    if (duplicateRows.length > 0) {
      return res.status(409).json({
        ok: false,
        error: "Module code already exists"
      });
    }

    const [result] = await promisePool.query(`
      INSERT INTO modules
      (
        module_code,
        module_name,
        description,
        module_image_url,
        created_by,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, TRUE)
    `, [
      normalizedCode,
      normalizedName,
      description || null,
      module_image_url || null,
      req.user.id
    ]);

    return res.status(201).json({
      ok: true,
      message: "Module created successfully",
      module_id: result.insertId
    });
  } catch (error) {
    console.error("Create module error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to create module"
    });
  }
});

// ======================================================
// UPDATE MODULE (ADMIN ONLY)
// ======================================================
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        ok: false,
        error: "Only admins can update modules"
      });
    }

    const moduleId = Number(req.params.id);

    const {
      module_name,
      module_code,
      description,
      module_image_url,
      is_active
    } = req.body;

    const [existingRows] = await promisePool.query(
      `SELECT module_id FROM modules WHERE module_id = ? LIMIT 1`,
      [moduleId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Module not found"
      });
    }

    if (module_code) {
      const normalizedCode = String(module_code).trim().toUpperCase();

      const [duplicateRows] = await promisePool.query(
        `SELECT module_id FROM modules WHERE module_code = ? AND module_id <> ? LIMIT 1`,
        [normalizedCode, moduleId]
      );

      if (duplicateRows.length > 0) {
        return res.status(409).json({
          ok: false,
          error: "Module code already exists"
        });
      }
    }

    await promisePool.query(`
      UPDATE modules
      SET
        module_name = ?,
        module_code = ?,
        description = ?,
        module_image_url = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE module_id = ?
    `, [
      module_name ? String(module_name).trim() : null,
      module_code ? String(module_code).trim().toUpperCase() : null,
      description || null,
      module_image_url || null,
      Boolean(is_active),
      moduleId
    ]);

    return res.json({
      ok: true,
      message: "Module updated successfully"
    });
  } catch (error) {
    console.error("Update module error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to update module"
    });
  }
});

// ======================================================
// SOFT DELETE MODULE (ADMIN ONLY)
// ======================================================
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        ok: false,
        error: "Only admins can delete modules"
      });
    }

    const moduleId = Number(req.params.id);

    const [result] = await promisePool.query(`
      UPDATE modules
      SET is_active = FALSE,
          updated_at = CURRENT_TIMESTAMP
      WHERE module_id = ?
    `, [moduleId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        error: "Module not found"
      });
    }

    return res.json({
      ok: true,
      message: "Module removed successfully"
    });
  } catch (error) {
    console.error("Delete module error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to delete module"
    });
  }
});

// ======================================================
// STUDENT JOIN MODULE USING MODULE CODE
// ======================================================
router.post("/join", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({
        ok: false,
        error: "Only students can join modules"
      });
    }

    const { module_code } = req.body;

    if (!module_code) {
      return res.status(400).json({
        ok: false,
        error: "Module code is required"
      });
    }

    const normalizedCode = String(module_code).trim().toUpperCase();

    const [moduleRows] = await promisePool.query(`
      SELECT module_id
      FROM modules
      WHERE module_code = ?
        AND is_active = TRUE
      LIMIT 1
    `, [normalizedCode]);

    if (moduleRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Invalid module code"
      });
    }

    const moduleId = moduleRows[0].module_id;

    await promisePool.query(`
      INSERT INTO module_students
      (
        module_id,
        student_id,
        enrolled_at,
        is_active
      )
      VALUES (?, ?, CURRENT_TIMESTAMP, TRUE)
      ON DUPLICATE KEY UPDATE
        is_active = TRUE,
        enrolled_at = CURRENT_TIMESTAMP
    `, [moduleId, req.user.id]);

    return res.json({
      ok: true,
      message: "Joined module successfully"
    });
  } catch (error) {
    console.error("Student join module error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to join module"
    });
  }
});

// ======================================================
// LECTURER ENROLL INTO MODULE
// ======================================================
router.post("/lecturer/join", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "lecturer") {
      return res.status(403).json({
        ok: false,
        error: "Only lecturers can enroll into modules"
      });
    }

    const { module_id } = req.body;

    if (!module_id) {
      return res.status(400).json({
        ok: false,
        error: "module_id is required"
      });
    }

    await promisePool.query(`
      INSERT INTO module_lecturers
      (
        module_id,
        lecturer_id,
        enrolled_by_admin_id,
        enrolled_at,
        is_active
      )
      VALUES (?, ?, NULL, CURRENT_TIMESTAMP, TRUE)
      ON DUPLICATE KEY UPDATE
        is_active = TRUE,
        enrolled_at = CURRENT_TIMESTAMP
    `, [module_id, req.user.id]);

    return res.json({
      ok: true,
      message: "Lecturer enrolled into module successfully"
    });
  } catch (error) {
    console.error("Lecturer join module error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to enroll lecturer into module"
    });
  }
});

// ======================================================
// GET MODULE MEMBERS
// ======================================================
router.get("/:id/members", authenticateToken, async (req, res) => {

  const moduleId = req.params.id;

  const [students] = await promisePool.query(`
    SELECT
      s.student_id,
      s.first_name,
      s.last_name,
      s.email,
      s.registration_number
    FROM module_students ms
    JOIN students s
      ON ms.student_id = s.student_id
    WHERE ms.module_id = ?
  `,[moduleId]);

  const [lecturers] = await promisePool.query(`
    SELECT
      l.lecturer_id,
      l.first_name,
      l.last_name,
      l.email,
      l.staff_id
    FROM module_lecturers ml
    JOIN lecturers l
      ON ml.lecturer_id = l.lecturer_id
    WHERE ml.module_id = ?
  `,[moduleId]);

  res.json({
    ok: true,
    students,
    lecturers
  });

});

module.exports = router;