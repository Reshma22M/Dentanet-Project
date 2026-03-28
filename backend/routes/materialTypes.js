const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

// --------------------------------------------------
// Helper
// --------------------------------------------------
async function getMaterialTypeById(id) {
  const [rows] = await promisePool.query(
    `
    SELECT
      material_type_id,
      name,
      is_active
    FROM material_types
    WHERE material_type_id = ?
    LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
}

// --------------------------------------------------
// GET all active material types
// --------------------------------------------------
router.get("/", authenticateToken, async (req, res) => {
  try {
    const [rows] = await promisePool.query(
      `
      SELECT
        material_type_id,
        name,
        is_active
      FROM material_types
      WHERE is_active = TRUE
      ORDER BY name ASC
      `
    );

    return res.json({
      ok: true,
      materialTypes: rows,
    });

  } catch (error) {
    console.error("Get material types error:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to fetch material types",
    });
  }
});

// --------------------------------------------------
// GET one material type
// --------------------------------------------------
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const materialType = await getMaterialTypeById(req.params.id);

    if (!materialType || !materialType.is_active) {
      return res.status(404).json({
        ok: false,
        error: "Material type not found",
      });
    }

    return res.json({
      ok: true,
      materialType,
    });

  } catch (error) {
    console.error("Get material type by id error:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to fetch material type",
    });
  }
});

module.exports = router;