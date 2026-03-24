const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { promisePool } = require("../config/database");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

const uploadDir = path.join(__dirname, "../uploads/materials");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
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
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF, DOC, DOCX, MP4, WEBM allowed."));
    }
  },
});

// Get all materials
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { module_id, material_type, category } = req.query;

    let query = `
      SELECT
        sm.material_id,
        sm.module_id,
        sm.uploaded_by,
        sm.title,
        sm.description,
        sm.material_type,
        sm.file_url,
        sm.external_url,
        sm.thumbnail_url,
        sm.category,
        sm.duration,
        sm.file_size_mb,
        sm.is_active,
        sm.created_at,
        sm.updated_at,
        m.module_code,
        m.module_name
      FROM study_materials sm
      LEFT JOIN modules m ON sm.module_id = m.module_id
      WHERE sm.is_active = TRUE
    `;

    const params = [];

    if (module_id) {
      query += " AND sm.module_id = ?";
      params.push(module_id);
    }

    if (material_type) {
      query += " AND sm.material_type = ?";
      params.push(material_type);
    }

    if (category) {
      query += " AND sm.category LIKE ?";
      params.push(`%${category}%`);
    }

    query += " ORDER BY sm.created_at DESC";

    const [rows] = await promisePool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error("Get materials error:", error);
    res.status(500).json({ error: "Failed to fetch materials" });
  }
});

// Get one material
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await promisePool.query(
      `
      SELECT
        sm.material_id,
        sm.module_id,
        sm.uploaded_by,
        sm.title,
        sm.description,
        sm.material_type,
        sm.file_url,
        sm.external_url,
        sm.thumbnail_url,
        sm.category,
        sm.duration,
        sm.file_size_mb,
        sm.is_active,
        sm.created_at,
        sm.updated_at,
        m.module_code,
        m.module_name
      FROM study_materials sm
      LEFT JOIN modules m ON sm.module_id = m.module_id
      WHERE sm.material_id = ? AND sm.is_active = TRUE
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Material not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Get material error:", error);
    res.status(500).json({ error: "Failed to fetch material" });
  }
});

// Upload material
router.post(
  "/",
  authenticateToken,
  authorizeRole("lecturer"),
  upload.single("file"),
  async (req, res) => {
    try {
      const {
        module_id,
        title,
        description,
        material_type,
        external_url,
        thumbnail_url,
        category,
        duration,
      } = req.body;

      if (!title || !material_type) {
        return res.status(400).json({
          error: "title and material_type are required",
        });
      }

      const validTypes = ["pdf", "youtube", "video", "link", "document", "other"];
      if (!validTypes.includes(material_type)) {
        return res.status(400).json({ error: "Invalid material_type" });
      }

      const fileTypes = ["pdf", "video", "document"];
      const linkTypes = ["youtube", "link", "other"];

      let file_url = null;
      let file_size_mb = null;

      if (fileTypes.includes(material_type)) {
        if (!req.file) {
          return res.status(400).json({
            error: `File is required for material_type '${material_type}'`,
          });
        }

        file_url = `/uploads/materials/${req.file.filename}`;
        file_size_mb = (req.file.size / (1024 * 1024)).toFixed(2);
      }

      if (linkTypes.includes(material_type) && !external_url) {
        return res.status(400).json({
          error: `external_url is required for material_type '${material_type}'`,
        });
      }

      const uploaded_by = req.user.id;

      const [result] = await promisePool.query(
        `
        INSERT INTO study_materials (
          module_id,
          uploaded_by,
          title,
          description,
          material_type,
          file_url,
          external_url,
          thumbnail_url,
          category,
          duration,
          file_size_mb,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
        `,
        [
          module_id || null,
          uploaded_by,
          title,
          description || null,
          material_type,
          file_url,
          external_url || null,
          thumbnail_url || null,
          category || null,
          duration || null,
          file_size_mb,
        ]
      );

      const [rows] = await promisePool.query(
        `SELECT * FROM study_materials WHERE material_id = ?`,
        [result.insertId]
      );

      res.status(201).json({
        message: "Material uploaded successfully",
        material: rows[0],
      });
    } catch (error) {
      console.error("Upload material error:", error);
      res.status(500).json({ error: "Failed to upload material" });
    }
  }
);

// Update material
router.put(
  "/:id",
  authenticateToken,
  authorizeRole("lecturer"),
  upload.single("file"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const [existingRows] = await promisePool.query(
        `SELECT * FROM study_materials WHERE material_id = ?`,
        [id]
      );

      if (existingRows.length === 0) {
        return res.status(404).json({ error: "Material not found" });
      }

      const existing = existingRows[0];

      if (existing.uploaded_by !== req.user.id) {
        return res.status(403).json({ error: "You can only edit your own materials" });
      }

      const {
        module_id,
        title,
        description,
        material_type,
        external_url,
        thumbnail_url,
        category,
        duration,
        is_active,
      } = req.body;

      let file_url = existing.file_url;
      let file_size_mb = existing.file_size_mb;

      if (req.file) {
        file_url = `/uploads/materials/${req.file.filename}`;
        file_size_mb = (req.file.size / (1024 * 1024)).toFixed(2);
      }

      await promisePool.query(
        `
        UPDATE study_materials
        SET
          module_id = ?,
          title = ?,
          description = ?,
          material_type = ?,
          file_url = ?,
          external_url = ?,
          thumbnail_url = ?,
          category = ?,
          duration = ?,
          file_size_mb = ?,
          is_active = ?
        WHERE material_id = ?
        `,
        [
          module_id || null,
          title || existing.title,
          description ?? existing.description,
          material_type || existing.material_type,
          file_url,
          external_url ?? existing.external_url,
          thumbnail_url ?? existing.thumbnail_url,
          category ?? existing.category,
          duration ?? existing.duration,
          file_size_mb,
          is_active !== undefined ? is_active : existing.is_active,
          id,
        ]
      );

      const [updatedRows] = await promisePool.query(
        `SELECT * FROM study_materials WHERE material_id = ?`,
        [id]
      );

      res.json({
        message: "Material updated successfully",
        material: updatedRows[0],
      });
    } catch (error) {
      console.error("Update material error:", error);
      res.status(500).json({ error: "Failed to update material" });
    }
  }
);

// Soft delete
router.delete("/:id", authenticateToken, authorizeRole("lecturer"), async (req, res) => {
  try {
    const { id } = req.params;

    const [existingRows] = await promisePool.query(
      `SELECT * FROM study_materials WHERE material_id = ?`,
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ error: "Material not found" });
    }

    const existing = existingRows[0];

    if (existing.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: "You can only delete your own materials" });
    }

    await promisePool.query(
      `UPDATE study_materials SET is_active = FALSE WHERE material_id = ?`,
      [id]
    );

    res.json({ message: "Material deleted successfully" });
  } catch (error) {
    console.error("Delete material error:", error);
    res.status(500).json({ error: "Failed to delete material" });
  }
});

module.exports = router;