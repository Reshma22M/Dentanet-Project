const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { promisePool } = require("../config/database");
const { validatePassword } = require("../middleware/validators");

// -----------------------------
// Helpers
// -----------------------------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false") === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendOtpEmail(toEmail, otp) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: "DentaNet Password Reset OTP",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>DentaNet Password Reset</h2>
        <p>Your OTP code is:</p>
        <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; margin: 12px 0;">
          ${otp}
        </div>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `,
  });
}

function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "24h",
  });
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildClientUser(user) {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
    role: user.role,
    registration_number: user.registration_number || null,
    registrationNumber: user.registration_number || null,
    staff_id: user.staff_id || null,
    staffId: user.staff_id || null,
    department_id: user.department_id || null,
    departmentId: user.department_id || null,
    department_name: user.department_name || null,
    departmentName: user.department_name || null,
    must_change_password: user.must_change_password || false,
    mustChangePassword: user.must_change_password || false,
    profile_image_url: user.profile_image_url || null,
    is_active: user.is_active,
  };
}

async function findAccountByIdentifier(identifier) {
  const raw = String(identifier || "").trim();
  const normalizedEmail = raw.toLowerCase();
  const normalizedCode = raw.toUpperCase();

  // admin by email
  const [admins] = await promisePool.query(
    `SELECT
        admin_id AS id,
        email,
        password_hash,
        first_name,
        last_name,
        must_change_password,
        profile_image_url,
        is_active,
        'admin' AS role
     FROM admins
     WHERE LOWER(email) = ?
     LIMIT 1`,
    [normalizedEmail]
  );

  if (admins.length > 0) {
    return {
      user: admins[0],
      role: "admin",
    };
  }

  // student by email or registration number
  const [students] = await promisePool.query(
    `SELECT
        student_id AS id,
        email,
        password_hash,
        first_name,
        last_name,
        registration_number,
        department_id,
        profile_image_url,
        is_active,
        'student' AS role
     FROM students
     WHERE LOWER(email) = ?
        OR registration_number = ?
     LIMIT 1`,
    [normalizedEmail, normalizedCode]
  );

  if (students.length > 0) {
    return {
      user: students[0],
      role: "student",
    };
  }

  // lecturer by email or staff_id
  const [lecturers] = await promisePool.query(
    `SELECT
        lecturer_id AS id,
        email,
        password_hash,
        first_name,
        last_name,
        staff_id,
        department_id,
        must_change_password,
        profile_image_url,
        is_active,
        'lecturer' AS role
     FROM lecturers
     WHERE LOWER(email) = ?
        OR staff_id = ?
     LIMIT 1`,
    [normalizedEmail, normalizedCode]
  );

  if (lecturers.length > 0) {
    return {
      user: lecturers[0],
      role: "lecturer",
    };
  }

  return null;
}

async function getFullUserProfile(role, id) {
  if (role === "admin") {
    const [rows] = await promisePool.query(
      `SELECT
          admin_id AS id,
          email,
          first_name,
          last_name,
          profile_image_url,
          must_change_password,
          is_active,
          'admin' AS role
       FROM admins
       WHERE admin_id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  if (role === "student") {
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
          'student' AS role
       FROM students s
       LEFT JOIN departments d ON s.department_id = d.department_id
       WHERE s.student_id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  if (role === "lecturer") {
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
          'lecturer' AS role
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

// -----------------------------
// LOGIN
// -----------------------------
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: "Identifier and password are required",
      });
    }

    const account = await findAccountByIdentifier(identifier);

    if (!account) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    const { user, role } = account;

    if (user.is_active === 0 || user.is_active === false) {
      return res.status(403).json({
        success: false,
        error: "Account is inactive. Contact administrator.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    if (
      (role === "admin" || role === "lecturer") &&
      (user.must_change_password === 1 || user.must_change_password === true)
    ) {
      return res.json({
        success: true,
        requiresPasswordChange: true,
        accountType: role,
        accountId: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        profile_image_url: user.profile_image_url || null,
      });
    }

    const fullUser = await getFullUserProfile(role, user.id);

    const token = generateToken({
      id: user.id,
      email: user.email,
      role,
    });

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: buildClientUser(fullUser),
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      error: "Login failed",
    });
  }
});

// -----------------------------
// VERIFY TOKEN
// -----------------------------
router.get("/verify", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getFullUserProfile(decoded.role, decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Account not found",
      });
    }

    if (user.is_active === 0 || user.is_active === false) {
      return res.status(403).json({
        success: false,
        error: "Account is inactive",
      });
    }

    return res.json({
      success: true,
      user: buildClientUser(user),
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
});

// -----------------------------
// FIRST-TIME CHANGE PASSWORD
// -----------------------------
router.post("/first-time-change-password", async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Email, current password and new password are required",
      });
    }

    const passwordValidation = validatePassword(
      newPassword,
      email,
      "",
      currentPassword
    );

    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: passwordValidation.error,
      });
    }

    const account = await findAccountByIdentifier(email);

    if (!account) {
      return res.status(404).json({
        success: false,
        error: "Account not found",
      });
    }

    const { user, role } = account;

    if (role !== "admin" && role !== "lecturer") {
      return res.status(400).json({
        success: false,
        error: "This account type does not require first-time password change",
      });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: "Current password is incorrect",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    if (role === "admin") {
      await promisePool.query(
        `UPDATE admins
         SET password_hash = ?, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE admin_id = ?`,
        [hashedPassword, user.id]
      );
    } else {
      await promisePool.query(
        `UPDATE lecturers
         SET password_hash = ?, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE lecturer_id = ?`,
        [hashedPassword, user.id]
      );
    }

    const fullUser = await getFullUserProfile(role, user.id);

    const token = generateToken({
      id: user.id,
      email: user.email,
      role,
    });

    return res.json({
      success: true,
      message: "Password changed successfully",
      token,
      user: buildClientUser(fullUser),
    });
  } catch (error) {
    console.error("First-time password change error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to change password",
    });
  }
});

// -----------------------------
// CHANGE PASSWORD (logged-in user)
// -----------------------------
router.post("/change-password", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Current password and new password are required",
      });
    }

    const user = await getFullUserProfile(decoded.role, decoded.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Account not found",
      });
    }

    const passwordValidation = validatePassword(
      newPassword,
      user.email,
      "",
      currentPassword
    );

    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: passwordValidation.error,
      });
    }

    let currentHash = null;

    if (decoded.role === "admin") {
      const [rows] = await promisePool.query(
        `SELECT password_hash FROM admins WHERE admin_id = ? LIMIT 1`,
        [decoded.id]
      );
      currentHash = rows[0]?.password_hash;
    } else if (decoded.role === "student") {
      const [rows] = await promisePool.query(
        `SELECT password_hash FROM students WHERE student_id = ? LIMIT 1`,
        [decoded.id]
      );
      currentHash = rows[0]?.password_hash;
    } else if (decoded.role === "lecturer") {
      const [rows] = await promisePool.query(
        `SELECT password_hash FROM lecturers WHERE lecturer_id = ? LIMIT 1`,
        [decoded.id]
      );
      currentHash = rows[0]?.password_hash;
    }

    if (!currentHash) {
      return res.status(404).json({
        success: false,
        error: "Account not found",
      });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, currentHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: "Current password is incorrect",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    if (decoded.role === "admin") {
      await promisePool.query(
        `UPDATE admins
         SET password_hash = ?, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE admin_id = ?`,
        [hashedPassword, decoded.id]
      );
    } else if (decoded.role === "student") {
      await promisePool.query(
        `UPDATE students
         SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
         WHERE student_id = ?`,
        [hashedPassword, decoded.id]
      );
    } else if (decoded.role === "lecturer") {
      await promisePool.query(
        `UPDATE lecturers
         SET password_hash = ?, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE lecturer_id = ?`,
        [hashedPassword, decoded.id]
      );
    }

    return res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to change password",
    });
  }
});

// -----------------------------
// FORGOT PASSWORD - SEND OTP
// -----------------------------
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const account = await findAccountByIdentifier(normalizedEmail);

    if (!account) {
      return res.status(404).json({
        success: false,
        error: "No account found with this email",
      });
    }

    const { user, role } = account;
    const otp = generateOTP();

    await promisePool.query(
      `DELETE FROM password_reset_tokens
       WHERE email = ? AND is_used = FALSE`,
      [user.email]
    );

    await promisePool.query(
      `INSERT INTO password_reset_tokens
        (account_type, account_id, otp_code, email, expires_at, is_used, attempts, last_sent_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), FALSE, 0, CURRENT_TIMESTAMP)`,
      [role, user.id, otp, user.email]
    );

    await sendOtpEmail(user.email, otp);

    return res.json({
      success: true,
      message: "OTP sent successfully to your email",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to send password reset OTP",
    });
  }
});

// -----------------------------
// RESET PASSWORD WITH OTP
// -----------------------------
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Email, OTP and new password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const passwordValidation = validatePassword(newPassword, normalizedEmail);

    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: passwordValidation.error,
      });
    }

    const [tokenRows] = await promisePool.query(
      `SELECT *
       FROM password_reset_tokens
       WHERE email = ?
         AND otp_code = ?
         AND is_used = FALSE
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedEmail, otp.trim()]
    );

    if (tokenRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired OTP",
      });
    }

    const tokenRow = tokenRows[0];
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    if (tokenRow.account_type === "admin") {
      await promisePool.query(
        `UPDATE admins
         SET password_hash = ?, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE admin_id = ?`,
        [hashedPassword, tokenRow.account_id]
      );
    } else if (tokenRow.account_type === "student") {
      await promisePool.query(
        `UPDATE students
         SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
         WHERE student_id = ?`,
        [hashedPassword, tokenRow.account_id]
      );
    } else if (tokenRow.account_type === "lecturer") {
      await promisePool.query(
        `UPDATE lecturers
         SET password_hash = ?, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE lecturer_id = ?`,
        [hashedPassword, tokenRow.account_id]
      );
    } else {
      return res.status(400).json({
        success: false,
        error: "Unsupported account type",
      });
    }

    await promisePool.query(
      `UPDATE password_reset_tokens
       SET is_used = TRUE, verified_at = CURRENT_TIMESTAMP
       WHERE token_id = ?`,
      [tokenRow.token_id]
    );

    return res.json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to reset password",
    });
  }
});

module.exports = router;