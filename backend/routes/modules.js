const express = require("express");
const router = express.Router();

const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { promisePool } = require("../config/database");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

// --------------------------------------------------
// Upload folder for module images
// --------------------------------------------------
const modulesUploadDir = path.join(__dirname, "../uploads/modules");

if (!fs.existsSync(modulesUploadDir)) {
  fs.mkdirSync(modulesUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(modulesUploadDir)) {
      fs.mkdirSync(modulesUploadDir, { recursive: true });
    }
    cb(null, modulesUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid image type"));
    }
  }
});

async function assignLecturerToModule(moduleId, lecturerId, adminId) {
  await promisePool.query(`
    UPDATE module_lecturers
    SET is_active = FALSE
    WHERE module_id = ?
  `, [moduleId]);

  if (!lecturerId) {
    return;
  }

  const [lecturerRows] = await promisePool.query(`
    SELECT lecturer_id
    FROM lecturers
    WHERE lecturer_id = ?
    LIMIT 1
  `, [lecturerId]);

  if (lecturerRows.length === 0) {
    throw new Error("Selected lecturer not found");
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
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, TRUE)
    ON DUPLICATE KEY UPDATE
      enrolled_by_admin_id = VALUES(enrolled_by_admin_id),
      enrolled_at = CURRENT_TIMESTAMP,
      is_active = TRUE
  `, [moduleId, lecturerId, adminId]);
}

// ======================================================
// GET ALL MODULES
// ======================================================
router.get("/", authenticateToken, async (req, res) => {
  try {
    let rows = [];

    if (req.user.role === "lecturer") {
      const [lecturerRows] = await promisePool.query(`
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
          a.last_name AS admin_last_name,
          l.lecturer_id AS assigned_lecturer_id,
          l.first_name AS assigned_lecturer_first_name,
          l.last_name AS assigned_lecturer_last_name,
          l.staff_id AS assigned_lecturer_staff_id
        FROM module_lecturers ml
        JOIN modules m
          ON ml.module_id = m.module_id
        LEFT JOIN admins a
          ON m.created_by = a.admin_id
        LEFT JOIN lecturers l
          ON ml.lecturer_id = l.lecturer_id
        WHERE ml.lecturer_id = ?
          AND ml.is_active = TRUE
          AND m.is_active = TRUE
        ORDER BY ml.enrolled_at DESC
      `, [req.user.id]);

      rows = lecturerRows;
    } else {
      const [defaultRows] = await promisePool.query(`
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
          a.last_name AS admin_last_name,
          l.lecturer_id AS assigned_lecturer_id,
          l.first_name AS assigned_lecturer_first_name,
          l.last_name AS assigned_lecturer_last_name,
          l.staff_id AS assigned_lecturer_staff_id
        FROM modules m
        LEFT JOIN admins a
          ON m.created_by = a.admin_id
        LEFT JOIN module_lecturers ml
          ON ml.module_id = m.module_id
         AND ml.is_active = TRUE
        LEFT JOIN lecturers l
          ON ml.lecturer_id = l.lecturer_id
        WHERE m.is_active = TRUE
        ORDER BY m.created_at DESC
      `);

      rows = defaultRows;
    }

    return res.json({
      ok: true,
      modules: rows
    });
  } catch (error) {
    console.error("Get modules error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch modules: " + (error ? error.message : "Unknown error")
    });
  }
});

// ======================================================
// GET STUDENT'S ENROLLED MODULES
// ======================================================
router.get("/my", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ ok: false, error: "Only students can access this endpoint" });
    }

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
        ms.enrolled_at
      FROM module_students ms
      JOIN modules m ON ms.module_id = m.module_id
      WHERE ms.student_id = ?
        AND ms.is_active = TRUE
        AND m.is_active = TRUE
      ORDER BY ms.enrolled_at DESC
    `, [req.user.id]);

    return res.json({ ok: true, modules: rows });
  } catch (error) {
    console.error("Get my modules error:", error);
    return res.status(500).json({ ok: false, error: "Failed to fetch enrolled modules" });
  }
});

// ======================================================
// GET MODULE BY ID
// ======================================================
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const moduleId = Number(req.params.id);

    if (!moduleId) {
      return res.status(400).json({
        ok: false,
        error: "Invalid module id"
      });
    }

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
        a.last_name AS admin_last_name,
        l.lecturer_id AS assigned_lecturer_id,
        l.first_name AS assigned_lecturer_first_name,
        l.last_name AS assigned_lecturer_last_name,
        l.staff_id AS assigned_lecturer_staff_id
      FROM modules m
      LEFT JOIN admins a
        ON m.created_by = a.admin_id
      LEFT JOIN module_lecturers ml
        ON ml.module_id = m.module_id
       AND ml.is_active = TRUE
      LEFT JOIN lecturers l
        ON ml.lecturer_id = l.lecturer_id
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
// GET MODULE MEMBERS
// ======================================================
router.get("/:id/members", authenticateToken, async (req, res) => {
  try {
    const moduleId = Number(req.params.id);

    if (!moduleId) {
      return res.status(400).json({
        ok: false,
        error: "Invalid module id"
      });
    }

    const [moduleExists] = await promisePool.query(
      `SELECT module_id FROM modules WHERE module_id = ? AND is_active = TRUE LIMIT 1`,
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
        s.registration_number,
        ms.enrolled_at
      FROM module_students ms
      JOIN students s
        ON ms.student_id = s.student_id
      WHERE ms.module_id = ?
        AND ms.is_active = TRUE
      ORDER BY ms.enrolled_at DESC
    `, [moduleId]);

    const [lecturers] = await promisePool.query(`
      SELECT
        l.lecturer_id,
        l.first_name,
        l.last_name,
        l.email,
        l.staff_id,
        ml.enrolled_at
      FROM module_lecturers ml
      JOIN lecturers l
        ON ml.lecturer_id = l.lecturer_id
      WHERE ml.module_id = ?
        AND ml.is_active = TRUE
      ORDER BY ml.enrolled_at DESC
    `, [moduleId]);

    return res.json({
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
      module_image_url,
      assigned_lecturer_id
    } = req.body;

    if (!module_name || !module_code) {
      return res.status(400).json({
        ok: false,
        error: "Module name and code are required"
      });
    }

    const normalizedCode = String(module_code).trim().toUpperCase();
    const normalizedName = String(module_name).trim();
    const normalizedDescription = description ? String(description).trim() : null;
    const normalizedImageUrl = module_image_url ? String(module_image_url).trim() : null;

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
      normalizedDescription,
      normalizedImageUrl,
      req.user.id
    ]);

    await assignLecturerToModule(
      result.insertId,
      assigned_lecturer_id ? Number(assigned_lecturer_id) : null,
      req.user.id
    );

    return res.status(201).json({
      ok: true,
      message: "Module created successfully",
      module_id: result.insertId
    });
  } catch (error) {
    console.error("Create module error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to create module"
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

    if (!moduleId) {
      return res.status(400).json({
        ok: false,
        error: "Invalid module id"
      });
    }

    const [existingRows] = await promisePool.query(
      `SELECT * FROM modules WHERE module_id = ? LIMIT 1`,
      [moduleId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Module not found"
      });
    }

    const existingModule = existingRows[0];

    const nextAssignedLecturerId =
      req.body.assigned_lecturer_id !== undefined && req.body.assigned_lecturer_id !== ""
        ? Number(req.body.assigned_lecturer_id)
        : null;

    const nextModuleName =
      req.body.module_name !== undefined
        ? String(req.body.module_name).trim()
        : existingModule.module_name;

    const nextModuleCode =
      req.body.module_code !== undefined
        ? String(req.body.module_code).trim().toUpperCase()
        : existingModule.module_code;

    const nextDescription =
      req.body.description !== undefined
        ? (req.body.description ? String(req.body.description).trim() : null)
        : existingModule.description;

    const nextImageUrl =
      req.body.module_image_url !== undefined
        ? (req.body.module_image_url ? String(req.body.module_image_url).trim() : null)
        : existingModule.module_image_url;

    const nextIsActive =
      req.body.is_active !== undefined
        ? Boolean(req.body.is_active)
        : existingModule.is_active;

    const [duplicateRows] = await promisePool.query(
      `SELECT module_id FROM modules WHERE module_code = ? AND module_id <> ? LIMIT 1`,
      [nextModuleCode, moduleId]
    );

    if (duplicateRows.length > 0) {
      return res.status(409).json({
        ok: false,
        error: "Module code already exists"
      });
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
      nextModuleName,
      nextModuleCode,
      nextDescription,
      nextImageUrl,
      nextIsActive,
      moduleId
    ]);

    await assignLecturerToModule(
      moduleId,
      nextAssignedLecturerId,
      req.user.id
    );

    return res.json({
      ok: true,
      message: "Module updated successfully"
    });
  } catch (error) {
    console.error("Update module error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to update module"
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

    if (!moduleId) {
      return res.status(400).json({
        ok: false,
        error: "Invalid module id"
      });
    }

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
// MODULE IMAGE UPLOAD (ADMIN ONLY)
// ======================================================
router.post(
  "/image",
  authenticateToken,
  authorizeRole("admin"),
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "No image uploaded"
        });
      }

      const fileUrl = `/uploads/modules/${req.file.filename}`;

      return res.json({
        ok: true,
        file_url: fileUrl
      });
    } catch (error) {
      console.error("Module image upload error:", error);
      return res.status(500).json({
        ok: false,
        error: "Failed to upload image"
      });
    }
  }
);

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
      message: "Joined module successfully",
      module_id: moduleId
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
// LECTURER SELF-ENROLL INTO MODULE
// Kept disabled because lecturer assignment is admin-controlled
// ======================================================
router.post("/lecturer/join", authenticateToken, async (req, res) => {
  return res.status(403).json({
    ok: false,
    error: "Lecturer enrollment is managed by admin assignment only"
  });
});

module.exports = router;
