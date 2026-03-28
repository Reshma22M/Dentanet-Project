const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { promisePool } = require("../config/database");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

// --------------------------------------------------
// Upload folder setup
// --------------------------------------------------
const uploadDir = path.join(__dirname, "../uploads/materials");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// --------------------------------------------------
// Multer setup
// --------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const allowedMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "video/mp4",
  "video/webm",
];

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only PDF, DOC, DOCX, MP4, WEBM allowed."
        )
      );
    }
  },
});

// --------------------------------------------------
// Helpers
// --------------------------------------------------
function normalizeTypeName(name) {
  return String(name || "").trim().toLowerCase();
}

function isFileBasedType(typeName) {
  return ["pdf", "video", "document", "other"].includes(typeName);
}

function isLinkBasedType(typeName) {
  return ["youtube", "external link"].includes(typeName);
}

async function getMaterialTypeById(materialTypeId) {
  const [rows] = await promisePool.query(
    `
    SELECT material_type_id, name, is_active
    FROM material_types
    WHERE material_type_id = ? AND is_active = TRUE
    LIMIT 1
    `,
    [materialTypeId]
  );

  return rows[0] || null;
}

async function getModuleById(moduleId) {
  const [rows] = await promisePool.query(
    `
    SELECT module_id, module_code, module_name, is_active
    FROM modules
    WHERE module_id = ? AND is_active = TRUE
    LIMIT 1
    `,
    [moduleId]
  );

  return rows[0] || null;
}

async function getMaterialById(materialId) {
  const [rows] = await promisePool.query(
    `
    SELECT
      sm.material_id,
      sm.module_id,
      sm.uploaded_by,
      sm.material_type_id,
      sm.title,
      sm.file_url,
      sm.external_url,
      sm.is_active,
      sm.created_at,
      sm.updated_at,
      m.module_code,
      m.module_name,
      mt.name AS material_type_name
    FROM study_materials sm
    LEFT JOIN modules m
      ON sm.module_id = m.module_id
    LEFT JOIN material_types mt
      ON sm.material_type_id = mt.material_type_id
    WHERE sm.material_id = ?
    LIMIT 1
    `,
    [materialId]
  );

  return rows[0] || null;
}

// --------------------------------------------------
// GET all materials
// --------------------------------------------------
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { module_id, material_type_id } = req.query;

    let query = `
      SELECT
        sm.material_id,
        sm.module_id,
        sm.uploaded_by,
        sm.material_type_id,
        sm.title,
        sm.file_url,
        sm.external_url,
        sm.is_active,
        sm.created_at,
        sm.updated_at,
        m.module_code,
        m.module_name,
        mt.name AS material_type_name
      FROM study_materials sm
      LEFT JOIN modules m
        ON sm.module_id = m.module_id
      LEFT JOIN material_types mt
        ON sm.material_type_id = mt.material_type_id
      WHERE sm.is_active = TRUE
    `;

    const params = [];

    if (module_id) {
      query += " AND sm.module_id = ?";
      params.push(Number(module_id));
    }

    if (material_type_id) {
      query += " AND sm.material_type_id = ?";
      params.push(Number(material_type_id));
    }

    query += " ORDER BY sm.created_at DESC";

    const [rows] = await promisePool.query(query, params);

    return res.json({
      ok: true,
      materials: rows,
    });
  } catch (error) {
    console.error("Get materials error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch materials",
    });
  }
});

// --------------------------------------------------
// GET one material
// --------------------------------------------------
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const material = await getMaterialById(Number(req.params.id));

    if (!material || material.is_active === 0 || material.is_active === false) {
      return res.status(404).json({
        ok: false,
        error: "Material not found",
      });
    }

    return res.json({
      ok: true,
      material,
    });
  } catch (error) {
    console.error("Get material error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch material",
    });
  }
});

// --------------------------------------------------
// POST upload material
// --------------------------------------------------
router.post(
  "/",
  authenticateToken,
  authorizeRole("lecturer"),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          ok: false,
          error: err.message || "File upload failed",
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { module_id, material_type_id, title, external_url } = req.body;

      if (!module_id || !material_type_id || !title) {
        return res.status(400).json({
          ok: false,
          error: "module_id, material_type_id and title are required",
        });
      }

      const numericModuleId = Number(module_id);
      const numericMaterialTypeId = Number(material_type_id);
      const uploaded_by = Number(req.user.id);

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const module = await getModuleById(numericModuleId);
      if (!module) {
        return res.status(400).json({
          ok: false,
          error: "Invalid module",
        });
      }

      const materialType = await getMaterialTypeById(numericMaterialTypeId);
      if (!materialType) {
        return res.status(400).json({
          ok: false,
          error: "Invalid material type",
        });
      }

      const materialTypeName = normalizeTypeName(materialType.name);

      let file_url = null;
      let finalExternalUrl = null;

      if (isFileBasedType(materialTypeName)) {
        if (!req.file) {
          return res.status(400).json({
            ok: false,
            error: `A file is required for material type '${materialType.name}'`,
          });
        }

        file_url = `/uploads/materials/${req.file.filename}`;
        finalExternalUrl = null;
      } else if (isLinkBasedType(materialTypeName)) {
        if (!external_url || !String(external_url).trim()) {
          return res.status(400).json({
            ok: false,
            error: `external_url is required for material type '${materialType.name}'`,
          });
        }

        file_url = null;
        finalExternalUrl = String(external_url).trim();
      } else {
        return res.status(400).json({
          ok: false,
          error: "Unsupported material type",
        });
      }

      console.log("Uploading material:", {
        module_id: numericModuleId,
        material_type_id: numericMaterialTypeId,
        title: String(title).trim(),
        uploaded_by,
        file_url,
        external_url: finalExternalUrl,
      });

      const [result] = await promisePool.query(
        `
        INSERT INTO study_materials (
          module_id,
          uploaded_by,
          material_type_id,
          title,
          file_url,
          external_url,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, TRUE)
        `,
        [
          numericModuleId,
          uploaded_by,
          numericMaterialTypeId,
          String(title).trim(),
          file_url,
          finalExternalUrl,
        ]
      );

      const material = await getMaterialById(result.insertId);

      return res.status(201).json({
        ok: true,
        message: "Material uploaded successfully",
        material,
      });
    } catch (error) {
      console.error("Upload material error:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "Failed to upload material",
      });
    }
  }
);

// --------------------------------------------------
// PUT update material
// --------------------------------------------------
router.put(
  "/:id",
  authenticateToken,
  authorizeRole("lecturer"),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          ok: false,
          error: err.message || "File upload failed",
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const materialId = Number(req.params.id);

      const [existingRows] = await promisePool.query(
        `SELECT * FROM study_materials WHERE material_id = ? LIMIT 1`,
        [materialId]
      );

      if (existingRows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Material not found",
        });
      }

      const existing = existingRows[0];

      if (Number(existing.uploaded_by) !== Number(req.user.id)) {
        return res.status(403).json({
          ok: false,
          error: "You can only edit your own materials",
        });
      }

      const { module_id, material_type_id, title, external_url, is_active } = req.body;

      const finalModuleId =
        module_id !== undefined && module_id !== ""
          ? Number(module_id)
          : Number(existing.module_id);

      const finalMaterialTypeId =
        material_type_id !== undefined && material_type_id !== ""
          ? Number(material_type_id)
          : Number(existing.material_type_id);

      const finalTitle =
        title !== undefined && String(title).trim()
          ? String(title).trim()
          : existing.title;

      const module = await getModuleById(finalModuleId);
      if (!module) {
        return res.status(400).json({
          ok: false,
          error: "Invalid module",
        });
      }

      const materialType = await getMaterialTypeById(finalMaterialTypeId);
      if (!materialType) {
        return res.status(400).json({
          ok: false,
          error: "Invalid material type",
        });
      }

      const materialTypeName = normalizeTypeName(materialType.name);

      let file_url = existing.file_url;
      let finalExternalUrl =
        external_url !== undefined
          ? String(external_url).trim()
          : existing.external_url;

      if (req.file) {
        file_url = `/uploads/materials/${req.file.filename}`;
      }

      if (isFileBasedType(materialTypeName)) {
        if (!file_url) {
          return res.status(400).json({
            ok: false,
            error: `A file is required for material type '${materialType.name}'`,
          });
        }
        finalExternalUrl = null;
      } else if (isLinkBasedType(materialTypeName)) {
        if (!finalExternalUrl) {
          return res.status(400).json({
            ok: false,
            error: `external_url is required for material type '${materialType.name}'`,
          });
        }
        file_url = null;
      } else {
        return res.status(400).json({
          ok: false,
          error: "Unsupported material type",
        });
      }

      await promisePool.query(
        `
        UPDATE study_materials
        SET
          module_id = ?,
          material_type_id = ?,
          title = ?,
          file_url = ?,
          external_url = ?,
          is_active = ?
        WHERE material_id = ?
        `,
        [
          finalModuleId,
          finalMaterialTypeId,
          finalTitle,
          file_url,
          finalExternalUrl,
          is_active !== undefined ? is_active : existing.is_active,
          materialId,
        ]
      );

      const material = await getMaterialById(materialId);

      return res.json({
        ok: true,
        message: "Material updated successfully",
        material,
      });
    } catch (error) {
      console.error("Update material error:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "Failed to update material",
      });
    }
  }
);

// --------------------------------------------------
// DELETE material (soft delete)
// --------------------------------------------------
router.delete(
  "/:id",
  authenticateToken,
  authorizeRole("lecturer"),
  async (req, res) => {
    try {
      const materialId = Number(req.params.id);

      const [existingRows] = await promisePool.query(
        `SELECT * FROM study_materials WHERE material_id = ? LIMIT 1`,
        [materialId]
      );

      if (existingRows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Material not found",
        });
      }

      const existing = existingRows[0];

      if (Number(existing.uploaded_by) !== Number(req.user.id)) {
        return res.status(403).json({
          ok: false,
          error: "You can only delete your own materials",
        });
      }

      await promisePool.query(
        `UPDATE study_materials SET is_active = FALSE WHERE material_id = ?`,
        [materialId]
      );

      return res.json({
        ok: true,
        message: "Material deleted successfully",
      });
    } catch (error) {
      console.error("Delete material error:", error);
      return res.status(500).json({
        ok: false,
        error: "Failed to delete material",
      });
    }
  }
);

module.exports = router;