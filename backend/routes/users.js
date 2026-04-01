const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const {
  validateEmail,
  validateFullName,
  validateStudentRegistrationNumber,
} = require("../middleware/validators");

// -----------------------------
// Helpers
// -----------------------------
function isOwnAccount(req, accountType, id) {
  return (
    String(req.user.role) === String(accountType) &&
    Number(req.user.id) === Number(id)
  );
}

function isPrimaryAdmin(req) {
  return req.user && req.user.role === "admin" && Number(req.user.id) === 1;
}

function normalizeAccountType(accountType) {
  const value = String(accountType || "").trim().toLowerCase();
  return ["admin", "student", "lecturer"].includes(value) ? value : null;
}

async function resolveDepartmentId(departmentInput) {
  if (!departmentInput) return null;

  if (!Number.isNaN(Number(departmentInput))) {
    const departmentId = Number(departmentInput);
    const [rows] = await promisePool.query(
      "SELECT department_id FROM departments WHERE department_id = ? LIMIT 1",
      [departmentId]
    );
    return rows.length > 0 ? rows[0].department_id : null;
  }

  const departmentName = String(departmentInput).trim();
  const [rows] = await promisePool.query(
    "SELECT department_id FROM departments WHERE department_name = ? LIMIT 1",
    [departmentName]
  );
  return rows.length > 0 ? rows[0].department_id : null;
}

async function emailExistsInOtherAccounts(accountType, id, email) {
  const [admins] = await promisePool.query(
    "SELECT admin_id FROM admins WHERE email = ? AND admin_id <> ? LIMIT 1",
    [email, accountType === "admin" ? id : -1]
  );
  if (admins.length > 0) return true;

  const [students] = await promisePool.query(
    "SELECT student_id FROM students WHERE email = ? AND student_id <> ? LIMIT 1",
    [email, accountType === "student" ? id : -1]
  );
  if (students.length > 0) return true;

  const [lecturers] = await promisePool.query(
    "SELECT lecturer_id FROM lecturers WHERE email = ? AND lecturer_id <> ? LIMIT 1",
    [email, accountType === "lecturer" ? id : -1]
  );
  return lecturers.length > 0;
}

async function getUserByType(accountType, id) {
  if (accountType === "admin") {
    const [rows] = await promisePool.query(
      `SELECT 
          admin_id AS id,
          email,
          first_name,
          last_name,
          must_change_password,
          is_active,
          profile_image_url,
          created_at,
          updated_at,
          'admin' AS account_type
       FROM admins
       WHERE admin_id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  if (accountType === "student") {
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
          s.profile_image_url,
          s.created_at,
          s.updated_at,
          'student' AS account_type
       FROM students s
       LEFT JOIN departments d ON s.department_id = d.department_id
       WHERE s.student_id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  if (accountType === "lecturer") {
    const [rows] = await promisePool.query(
      `SELECT 
          l.lecturer_id AS id,
          l.email,
          l.first_name,
          l.last_name,
          l.staff_id,
          l.department_id,
          d.department_name,
          l.must_change_password,
          l.is_active,
          l.profile_image_url,
          l.created_at,
          l.updated_at,
          'lecturer' AS account_type
       FROM lecturers l
       LEFT JOIN departments d ON l.department_id = d.department_id
       WHERE l.lecturer_id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  return null;
}

async function handleGetUser(req, res, accountType, id) {
  if (req.user.role !== "admin" && !isOwnAccount(req, accountType, id)) {
    return res.status(403).json({
      success: false,
      error: "Access denied",
    });
  }

  const user = await getUserByType(accountType, id);

  if (!user) {
    return res.status(404).json({
      success: false,
      error: "User not found",
    });
  }

  return res.json({
    success: true,
    user,
  });
}

async function handleUpdateUser(req, res, accountType, id) {
  const adminMode = req.user.role === "admin";
  const ownAccountMode = isOwnAccount(req, accountType, id);

  if (!adminMode && !ownAccountMode) {
    return res.status(403).json({
      success: false,
      error: "Access denied",
    });
  }

  if (accountType === "admin" && req.user.role === "admin" && !isPrimaryAdmin(req)) {
  return res.status(403).json({
    success: false,
    error: "Only the primary admin can edit admin accounts",
  });
}

  const existingUser = await getUserByType(accountType, id);
  if (!existingUser) {
    return res.status(404).json({
      success: false,
      error: "User not found",
    });
  }

  const {
    email,
    firstName,
    lastName,
    registrationNumber,
    staffId,
    department,
    departmentId,
    isActive,
    profileImageUrl,
    mustChangePassword,
  } = req.body;

  const nextFirstName =
    firstName !== undefined ? String(firstName).trim() : existingUser.first_name;
  const nextLastName =
    lastName !== undefined ? String(lastName).trim() : existingUser.last_name;

  const nameValidation = validateFullName(
    `${nextFirstName} ${nextLastName}`.trim()
  );
  if (!nameValidation.valid) {
    return res.status(400).json({
      success: false,
      error: nameValidation.error,
    });
  }

  let nextEmail = existingUser.email;
  if (email !== undefined) {
    const ev = validateEmail(email);
    if (!ev.valid) {
      return res.status(400).json({
        success: false,
        error: ev.error,
      });
    }

    const emailUsed = await emailExistsInOtherAccounts(accountType, id, ev.sanitized);
    if (emailUsed) {
      return res.status(409).json({
        success: false,
        error: "Email already exists",
      });
    }

    nextEmail = ev.sanitized;
  }

  if (!adminMode) {
    if (
      registrationNumber !== undefined ||
      staffId !== undefined ||
      department !== undefined ||
      departmentId !== undefined ||
      isActive !== undefined ||
      mustChangePassword !== undefined
    ) {
      return res.status(403).json({
        success: false,
        error: "You can only update your basic profile details",
      });
    }
  }

  if (accountType === "admin") {
    const updateIsActive =
      adminMode && isActive !== undefined ? Boolean(isActive) : existingUser.is_active;

    const updateMustChangePassword =
      adminMode && mustChangePassword !== undefined
        ? Boolean(mustChangePassword)
        : existingUser.must_change_password;

    if (adminMode && id === 1 && updateIsActive === false) {
      return res.status(400).json({
        success: false,
        error: "Primary admin account cannot be deactivated",
      });
    }

    await promisePool.query(
      `UPDATE admins
       SET email = ?, first_name = ?, last_name = ?, is_active = ?, must_change_password = ?, profile_image_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE admin_id = ?`,
      [
        nextEmail,
        nextFirstName,
        nextLastName,
        updateIsActive,
        updateMustChangePassword,
        profileImageUrl !== undefined ? profileImageUrl : existingUser.profile_image_url,
        id,
      ]
    );
  } else if (accountType === "student") {
    let nextRegistrationNumber = existingUser.registration_number;
    let nextDepartmentId = existingUser.department_id;
    const updateIsActive =
      adminMode && isActive !== undefined ? Boolean(isActive) : existingUser.is_active;

    if (registrationNumber !== undefined) {
      const rn = validateStudentRegistrationNumber(registrationNumber);
      if (!rn.valid) {
        return res.status(400).json({
          success: false,
          error: rn.error,
        });
      }

      const [dup] = await promisePool.query(
        "SELECT student_id FROM students WHERE registration_number = ? AND student_id <> ? LIMIT 1",
        [rn.sanitized, id]
      );

      if (dup.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Registration number already exists",
        });
      }

      nextRegistrationNumber = rn.sanitized;
    }

    if (department !== undefined || departmentId !== undefined) {
      const resolvedDepartmentId = await resolveDepartmentId(
        departmentId || department
      );

      if (!resolvedDepartmentId) {
        return res.status(400).json({
          success: false,
          error: "Valid department is required",
        });
      }

      nextDepartmentId = resolvedDepartmentId;
    }

    await promisePool.query(
      `UPDATE students
       SET email = ?, first_name = ?, last_name = ?, registration_number = ?, department_id = ?, is_active = ?, profile_image_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE student_id = ?`,
      [
        nextEmail,
        nextFirstName,
        nextLastName,
        nextRegistrationNumber,
        nextDepartmentId,
        updateIsActive,
        profileImageUrl !== undefined ? profileImageUrl : existingUser.profile_image_url,
        id,
      ]
    );
  } else if (accountType === "lecturer") {
    let nextStaffId = existingUser.staff_id;
    let nextDepartmentId = existingUser.department_id;
    const updateIsActive =
      adminMode && isActive !== undefined ? Boolean(isActive) : existingUser.is_active;

    const updateMustChangePassword =
      adminMode && mustChangePassword !== undefined
        ? Boolean(mustChangePassword)
        : existingUser.must_change_password;

    if (staffId !== undefined) {
      const normalizedStaffId = String(staffId).trim().toUpperCase();

      const [dup] = await promisePool.query(
        "SELECT lecturer_id FROM lecturers WHERE staff_id = ? AND lecturer_id <> ? LIMIT 1",
        [normalizedStaffId, id]
      );

      if (dup.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Staff ID already exists",
        });
      }

      nextStaffId = normalizedStaffId;
    }

    if (department !== undefined || departmentId !== undefined) {
      const resolvedDepartmentId = await resolveDepartmentId(
        departmentId || department
      );

      if (!resolvedDepartmentId) {
        return res.status(400).json({
          success: false,
          error: "Valid department is required",
        });
      }

      nextDepartmentId = resolvedDepartmentId;
    }

    await promisePool.query(
      `UPDATE lecturers
       SET email = ?, first_name = ?, last_name = ?, staff_id = ?, department_id = ?, is_active = ?, must_change_password = ?, profile_image_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE lecturer_id = ?`,
      [
        nextEmail,
        nextFirstName,
        nextLastName,
        nextStaffId,
        nextDepartmentId,
        updateIsActive,
        updateMustChangePassword,
        profileImageUrl !== undefined ? profileImageUrl : existingUser.profile_image_url,
        id,
      ]
    );
  }

  const updatedUser = await getUserByType(accountType, id);

  return res.json({
    success: true,
    message: "User updated successfully",
    user: updatedUser,
  });
}

async function handleDeactivateUser(req, res, accountType, id) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: "Access denied",
    });
  }

  if (accountType === "admin" && !isPrimaryAdmin(req)) {
  return res.status(403).json({
    success: false,
    error: "Only the primary admin can deactivate admin accounts",
  });
}

  if (accountType === "admin" && id === 1) {
    return res.status(400).json({
      success: false,
      error: "Primary admin account cannot be deactivated",
    });
  }

  if (accountType === "admin" && Number(req.user.id) === id) {
    return res.status(400).json({
      success: false,
      error: "You cannot deactivate your own admin account",
    });
  }

  let result;

  if (accountType === "admin") {
    [result] = await promisePool.query(
      "UPDATE admins SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE admin_id = ?",
      [id]
    );
  } else if (accountType === "student") {
    [result] = await promisePool.query(
      "UPDATE students SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE student_id = ?",
      [id]
    );
  } else if (accountType === "lecturer") {
    [result] = await promisePool.query(
      "UPDATE lecturers SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE lecturer_id = ?",
      [id]
    );
  }

  if (!result || result.affectedRows === 0) {
    return res.status(404).json({
      success: false,
      error: "User not found",
    });
  }

  return res.json({
    success: true,
    message: "Account deactivated successfully",
  });
}

// -----------------------------
// Get all accounts (admin only)
// -----------------------------
router.get("/", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    const [rows] = await promisePool.query(`
      SELECT
        id,
        account_type,
        email,
        first_name,
        last_name,
        identifier,
        department_id,
        department_name,
        must_change_password,
        is_active,
        profile_image_url,
        created_at
      FROM (
        SELECT
          a.admin_id AS id,
          'admin' AS account_type,
          a.email,
          a.first_name,
          a.last_name,
          NULL AS identifier,
          NULL AS department_id,
          NULL AS department_name,
          a.must_change_password,
          a.is_active,
          a.profile_image_url,
          a.created_at
        FROM admins a

        UNION ALL

        SELECT
          s.student_id AS id,
          'student' AS account_type,
          s.email,
          s.first_name,
          s.last_name,
          s.registration_number AS identifier,
          s.department_id,
          d.department_name,
          FALSE AS must_change_password,
          s.is_active,
          s.profile_image_url,
          s.created_at
        FROM students s
        LEFT JOIN departments d ON s.department_id = d.department_id

        UNION ALL

        SELECT
          l.lecturer_id AS id,
          'lecturer' AS account_type,
          l.email,
          l.first_name,
          l.last_name,
          l.staff_id AS identifier,
          l.department_id,
          d.department_name,
          l.must_change_password,
          l.is_active,
          l.profile_image_url,
          l.created_at
        FROM lecturers l
        LEFT JOIN departments d ON l.department_id = d.department_id
      ) t
      ORDER BY created_at DESC
    `);

    return res.json({
      success: true,
      users: rows,
    });
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch users",
    });
  }
});

// -----------------------------
// Get current logged-in user's own profile
// -----------------------------
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await getUserByType(req.user.role, req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get current user error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch user",
    });
  }
});

// -----------------------------
// Typed routes
// -----------------------------
router.get("/:accountType/:id", authenticateToken, async (req, res) => {
  try {
    const accountType = normalizeAccountType(req.params.accountType);
    const id = parseInt(req.params.id, 10);

    if (!accountType || Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid account type or id",
      });
    }

    return await handleGetUser(req, res, accountType, id);
  } catch (error) {
    console.error("Get user error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch user",
    });
  }
});

router.put("/:accountType/:id", authenticateToken, async (req, res) => {
  try {
    const accountType = normalizeAccountType(req.params.accountType);
    const id = parseInt(req.params.id, 10);

    if (!accountType || Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid account type or id",
      });
    }

    return await handleUpdateUser(req, res, accountType, id);
  } catch (error) {
    console.error("Update user error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update user",
    });
  }
});

router.delete("/:accountType/:id", authenticateToken, async (req, res) => {
  try {
    const accountType = normalizeAccountType(req.params.accountType);
    const id = parseInt(req.params.id, 10);

    if (!accountType || Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid account type or id",
      });
    }

    return await handleDeactivateUser(req, res, accountType, id);
  } catch (error) {
    console.error("Deactivate user error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to deactivate user",
    });
  }
});

// -----------------------------
// Legacy routes using ?accountType= or body.accountType
// -----------------------------
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const accountType = normalizeAccountType(req.query.accountType);

    if (!accountType || Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "accountType is required",
      });
    }

    return await handleGetUser(req, res, accountType, id);
  } catch (error) {
    console.error("Legacy get user error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch user",
    });
  }
});

router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const accountType = normalizeAccountType(req.body.accountType || req.query.accountType);

    if (!accountType || Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "accountType is required",
      });
    }

    return await handleUpdateUser(req, res, accountType, id);
  } catch (error) {
    console.error("Legacy update user error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update user",
    });
  }
});

router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const accountType = normalizeAccountType(req.query.accountType || req.body.accountType);

    if (!accountType || Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "accountType is required",
      });
    }

    return await handleDeactivateUser(req, res, accountType, id);
  } catch (error) {
    console.error("Legacy deactivate user error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to deactivate user",
    });
  }
});

module.exports = router;