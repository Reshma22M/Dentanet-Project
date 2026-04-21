const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const { promisePool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

// --------------------------------------------------
// Upload folder setup
// --------------------------------------------------
const uploadDir = path.join(__dirname, "../uploads/student-materials");

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

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "video/mp4",
  "video/webm",
]);

const allowedExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
  ".mp4",
  ".webm",
]);

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const mimeAllowed = allowedMimeTypes.has(String(file.mimetype || "").toLowerCase());
    const extensionAllowed = allowedExtensions.has(extension);

    if (mimeAllowed || extensionAllowed) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only PDF, DOC, DOCX, PPT, PPTX, JPG, PNG, MP4, and WEBM are allowed."
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

function isLinkBasedType(typeName) {
  return ["youtube", "external link"].includes(typeName);
}

function isFileBasedType(typeName) {
  return !isLinkBasedType(typeName);
}

function getYouTubeVideoId(urlValue) {
  const raw = String(urlValue || "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();

    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\/+/, "").split("/")[0];
      return id || null;
    }

    if (host.endsWith("youtube.com")) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }

      if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
        const chunks = parsed.pathname.split("/").filter(Boolean);
        return chunks.length >= 2 ? chunks[1] : null;
      }
    }
  } catch (error) {
    const fallback = raw.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/i);
    return fallback ? fallback[1] : null;
  }

  return null;
}

function isImageFileUrl(fileUrl) {
  const text = String(fileUrl || "").toLowerCase().split("?")[0];
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(text);
}

function buildMaterialThumbnail(material) {
  if (!material) return null;

  if (material.thumbnail_url) return material.thumbnail_url;

  const typeName = normalizeTypeName(material.material_type_name);
  if (typeName === "youtube") {
    const videoId = getYouTubeVideoId(material.external_url);
    if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }

  if (isImageFileUrl(material.file_url)) {
    return material.file_url;
  }

  return null;
}

function attachMaterialThumbnail(material) {
  if (!material) return material;
  return {
    ...material,
    thumbnail_url: buildMaterialThumbnail(material)
  };
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

function isValidPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
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

  return rows[0] ? attachMaterialThumbnail(rows[0]) : null;
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

async function getStudentSharedMaterialById(studentMaterialId) {
  const [rows] = await promisePool.query(
    `
    SELECT
      ssm.student_material_id,
      ssm.module_id,
      ssm.uploaded_by_student_id,
      ssm.material_type_id,
      ssm.title,
      ssm.description,
      ssm.file_url,
      ssm.external_url,
      ssm.is_active,
      ssm.created_at,
      ssm.updated_at,

      m.module_code,
      m.module_name,

      mt.name AS material_type_name,

      s.first_name AS student_first_name,
      s.last_name AS student_last_name,
      s.registration_number

    FROM student_study_materials ssm
    LEFT JOIN modules m
      ON ssm.module_id = m.module_id
    LEFT JOIN material_types mt
      ON ssm.material_type_id = mt.material_type_id
    LEFT JOIN students s
      ON ssm.uploaded_by_student_id = s.student_id
    WHERE ssm.student_material_id = ?
    LIMIT 1
    `,
    [studentMaterialId]
  );

  return rows[0] || null;
}

// --------------------------------------------------
// GET all student shared materials
// --------------------------------------------------
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { module_id, material_type_id } = req.query;

    let query = `
      SELECT
        ssm.student_material_id,
        ssm.module_id,
        ssm.uploaded_by_student_id,
        ssm.material_type_id,
        ssm.title,
        ssm.description,
        ssm.file_url,
        ssm.external_url,
        ssm.is_active,
        ssm.created_at,
        ssm.updated_at,

        m.module_code,
        m.module_name,

        mt.name AS material_type_name,

        s.first_name AS student_first_name,
        s.last_name AS student_last_name,
        s.registration_number

      FROM student_study_materials ssm
      LEFT JOIN modules m
        ON ssm.module_id = m.module_id
      LEFT JOIN material_types mt
        ON ssm.material_type_id = mt.material_type_id
      LEFT JOIN students s
        ON ssm.uploaded_by_student_id = s.student_id
      WHERE ssm.is_active = TRUE
    `;

    const params = [];

    if (module_id) {
      query += ` AND ssm.module_id = ?`;
      params.push(Number(module_id));
    }

    if (material_type_id) {
      query += ` AND ssm.material_type_id = ?`;
      params.push(Number(material_type_id));
    }

    query += ` ORDER BY ssm.created_at DESC`;

    const [rows] = await promisePool.query(query, params);

    return res.json({
      ok: true,
      materials: rows.map(attachMaterialThumbnail),
    });
  } catch (error) {
    console.error("Get student shared materials error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch student shared materials",
    });
  }
});

// --------------------------------------------------
// GET one student shared material
// --------------------------------------------------
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const studentMaterialId = Number(req.params.id);
    if (!isValidPositiveInt(studentMaterialId)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid material id",
      });
    }

    const material = await getStudentSharedMaterialById(studentMaterialId);

    if (!material || material.is_active === 0 || material.is_active === false) {
      return res.status(404).json({
        ok: false,
        error: "Shared material not found",
      });
    }

    return res.json({
      ok: true,
      material,
    });
  } catch (error) {
    console.error("Get student shared material error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch shared material",
    });
  }
});

// --------------------------------------------------
// POST upload shared material (student only)
// --------------------------------------------------
router.post(
  "/",
  authenticateToken,
  (req, res, next) => {
    if (req.user.role !== "student") {
      return res.status(403).json({
        ok: false,
        error: "Only students can upload shared materials",
      });
    }

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
      const {
        module_id,
        material_type_id,
        title,
        description,
        external_url
      } = req.body;

      if (!module_id || !material_type_id || !title) {
        return res.status(400).json({
          ok: false,
          error: "module_id, material_type_id and title are required",
        });
      }

      const numericModuleId = Number(module_id);
      const numericMaterialTypeId = Number(material_type_id);
      const uploadedByStudentId = Number(req.user.id);

      if (!isValidPositiveInt(numericModuleId) || !isValidPositiveInt(numericMaterialTypeId)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid module or material type",
        });
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

      if (isLinkBasedType(materialTypeName)) {
        if (!external_url || !String(external_url).trim()) {
          return res.status(400).json({
            ok: false,
            error: `external_url is required for material type '${materialType.name}'`,
          });
        }

        file_url = null;
        finalExternalUrl = String(external_url).trim();
      } else {
        if (!req.file) {
          return res.status(400).json({
            ok: false,
            error: `A file is required for material type '${materialType.name}'`,
          });
        }

        file_url = `/uploads/student-materials/${req.file.filename}`;
        finalExternalUrl = null;
      }

      const [result] = await promisePool.query(
        `
        INSERT INTO student_study_materials (
          module_id,
          uploaded_by_student_id,
          material_type_id,
          title,
          description,
          file_url,
          external_url,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
        `,
        [
          numericModuleId,
          uploadedByStudentId,
          numericMaterialTypeId,
          String(title).trim(),
          cleanText(description),
          file_url,
          finalExternalUrl,
        ]
      );

      const material = await getStudentSharedMaterialById(result.insertId);

      return res.status(201).json({
        ok: true,
        message: "Shared material uploaded successfully",
        material,
      });
    } catch (error) {
      console.error("Upload student shared material error:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "Failed to upload shared material",
      });
    }
  }
);

// --------------------------------------------------
// PUT update shared material (owner only)
// --------------------------------------------------
router.put(
  "/:id",
  authenticateToken,
  (req, res, next) => {
    if (req.user.role !== "student") {
      return res.status(403).json({
        ok: false,
        error: "Only students can edit shared materials",
      });
    }

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
      const studentMaterialId = Number(req.params.id);
      if (!isValidPositiveInt(studentMaterialId)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid material id",
        });
      }

      const [existingRows] = await promisePool.query(
        `SELECT * FROM student_study_materials WHERE student_material_id = ? LIMIT 1`,
        [studentMaterialId]
      );

      if (existingRows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "Shared material not found",
        });
      }

      const existing = existingRows[0];

      if (Number(existing.uploaded_by_student_id) !== Number(req.user.id)) {
        return res.status(403).json({
          ok: false,
          error: "You can only edit your own shared materials",
        });
      }

      const {
        module_id,
        material_type_id,
        title,
        description,
        external_url,
        is_active
      } = req.body;

      const finalModuleId =
        module_id !== undefined && module_id !== ""
          ? Number(module_id)
          : Number(existing.module_id);

      const finalMaterialTypeId =
        material_type_id !== undefined && material_type_id !== ""
          ? Number(material_type_id)
          : Number(existing.material_type_id);

      if (!isValidPositiveInt(finalModuleId) || !isValidPositiveInt(finalMaterialTypeId)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid module or material type",
        });
      }

      const finalTitle =
        title !== undefined && String(title).trim()
          ? String(title).trim()
          : existing.title;

      const finalDescription =
        description !== undefined
          ? cleanText(description)
          : existing.description;

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
        file_url = `/uploads/student-materials/${req.file.filename}`;
      }

      if (isLinkBasedType(materialTypeName)) {
        if (!finalExternalUrl) {
          return res.status(400).json({
            ok: false,
            error: `external_url is required for material type '${materialType.name}'`,
          });
        }
        file_url = null;
      } else {
        if (!file_url) {
          return res.status(400).json({
            ok: false,
            error: `A file is required for material type '${materialType.name}'`,
          });
        }
        finalExternalUrl = null;
      }

      await promisePool.query(
        `
        UPDATE student_study_materials
        SET
          module_id = ?,
          material_type_id = ?,
          title = ?,
          description = ?,
          file_url = ?,
          external_url = ?,
          is_active = ?
        WHERE student_material_id = ?
        `,
        [
          finalModuleId,
          finalMaterialTypeId,
          finalTitle,
          finalDescription,
          file_url,
          finalExternalUrl,
          is_active !== undefined ? is_active : existing.is_active,
          studentMaterialId,
        ]
      );

      const material = await getStudentSharedMaterialById(studentMaterialId);

      return res.json({
        ok: true,
        message: "Shared material updated successfully",
        material,
      });
    } catch (error) {
      console.error("Update student shared material error:", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "Failed to update shared material",
      });
    }
  }
);

// --------------------------------------------------
// DELETE shared material (owner only)
// --------------------------------------------------
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({
        ok: false,
        error: "Only students can delete shared materials",
      });
    }

    const studentMaterialId = Number(req.params.id);
    if (!isValidPositiveInt(studentMaterialId)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid material id",
      });
    }

    const [existingRows] = await promisePool.query(
      `SELECT * FROM student_study_materials WHERE student_material_id = ? LIMIT 1`,
      [studentMaterialId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Shared material not found",
      });
    }

    const existing = existingRows[0];

    if (Number(existing.uploaded_by_student_id) !== Number(req.user.id)) {
      return res.status(403).json({
        ok: false,
        error: "You can only delete your own shared materials",
      });
    }

    await promisePool.query(
      `UPDATE student_study_materials SET is_active = FALSE WHERE student_material_id = ?`,
      [studentMaterialId]
    );

    return res.json({
      ok: true,
      message: "Shared material deleted successfully",
    });
  } catch (error) {
    console.error("Delete student shared material error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to delete shared material",
    });
  }
});

module.exports = router;
