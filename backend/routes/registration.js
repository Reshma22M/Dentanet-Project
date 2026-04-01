const express = require("express");
const router = express.Router();
const { promisePool } = require("../config/database");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const { authenticateToken } = require("../middleware/auth");
const {
  validateEmail,
  validatePassword,
  validateFullName,
  validateStudentRegistrationNumber,
} = require("../middleware/validators");

// -----------------------------
// Mail transporter
// -----------------------------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: String(process.env.SMTP_SECURE || "false") === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const pendingRegistrations = new Map();

// -----------------------------
// Helpers
// -----------------------------
function generateOTP() {
  return String(crypto.randomInt(100000, 999999));
}

function generateTempPassword(length = 10) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@$!%*?&";
  let password = "";

  for (let i = 0; i < length; i += 1) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return password;
}

function splitName(fullName, firstName, lastName) {
  let fName = firstName ? String(firstName).trim() : "";
  let lName = lastName ? String(lastName).trim() : "";

  if ((!fName || !lName) && fullName) {
    const parts = String(fullName).trim().split(/\s+/);
    fName = parts[0] || "";
    lName = parts.slice(1).join(" ") || parts[0] || "";
  }

  return {
    firstName: fName,
    lastName: lName,
  };
}

async function emailExistsAcrossAccounts(email) {
  const [admins] = await promisePool.query(
    "SELECT admin_id FROM admins WHERE email = ? LIMIT 1",
    [email]
  );
  if (admins.length > 0) return true;

  const [students] = await promisePool.query(
    "SELECT student_id FROM students WHERE email = ? LIMIT 1",
    [email]
  );
  if (students.length > 0) return true;

  const [lecturers] = await promisePool.query(
    "SELECT lecturer_id FROM lecturers WHERE email = ? LIMIT 1",
    [email]
  );
  return lecturers.length > 0;
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

async function sendAccountCreatedEmail({
  toEmail,
  roleLabel,
  loginIdentifier,
  tempPassword,
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"DentaNet LMS" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: `Your DentaNet ${roleLabel} Account`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; line-height: 1.6;">
        <h2>DentaNet ${roleLabel} Account Created</h2>
        <p>Your account has been created successfully.</p>
        <p><strong>Login:</strong> ${loginIdentifier}</p>
        <p><strong>Temporary Password:</strong> <code>${tempPassword}</code></p>
        <p>Please log in and change your password on first login.</p>
      </div>
    `,
  });
}

function isPrimaryAdmin(req) {
  return req.user && req.user.role === "admin" && Number(req.user.id) === 1;
}

// -----------------------------
// SEND OTP
// -----------------------------
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    const ev = validateEmail(email);
    if (!ev.valid) {
      return res.status(400).json({
        success: false,
        error: ev.error,
      });
    }

    const sanitizedEmail = ev.sanitized;

    const alreadyExists = await emailExistsAcrossAccounts(sanitizedEmail);
    if (alreadyExists) {
      return res.status(409).json({
        success: false,
        error: "User with this email already exists",
      });
    }

    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    pendingRegistrations.set(sanitizedEmail, {
      otp: String(otp).trim(),
      expiresAt,
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"DentaNet LMS" <${process.env.SMTP_USER}>`,
      to: sanitizedEmail,
      subject: "DentaNet OTP Verification",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>DentaNet Email Verification</h2>
          <p>Your OTP code is:</p>
          <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; margin: 20px 0;">
            ${otp}
          </div>
          <p>This code expires in 10 minutes.</p>
        </div>
      `,
    });

    return res.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("send-otp error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to send OTP",
    });
  }
});

// -----------------------------
// VERIFY + REGISTER (students only)
// Student account created inactive.
// Admin can approve later.
// -----------------------------
router.post("/verify-and-register", async (req, res) => {
  try {
    const {
      email,
      otp,
      password,
      firstName,
      lastName,
      registrationNumber,
      department,
      departmentId,
    } = req.body;

    if (!email || !otp || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: "Email, OTP, password, first name and last name are required",
      });
    }

    const ev = validateEmail(email);
    if (!ev.valid) {
      return res.status(400).json({
        success: false,
        error: ev.error,
      });
    }

    const sanitizedEmail = ev.sanitized;
    const pending = pendingRegistrations.get(sanitizedEmail);

    if (!pending) {
      return res.status(400).json({
        success: false,
        error: "No OTP requested for this email",
      });
    }

    if (Date.now() > pending.expiresAt) {
      pendingRegistrations.delete(sanitizedEmail);
      return res.status(400).json({
        success: false,
        error: "OTP expired",
      });
    }

    if (String(pending.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        error: "Invalid OTP",
      });
    }

    const pw = validatePassword(password, sanitizedEmail);
    if (!pw.valid) {
      return res.status(400).json({
        success: false,
        error: pw.error,
      });
    }

    const combinedName = `${firstName} ${lastName}`.trim();
    const nm = validateFullName(combinedName);
    if (!nm.valid) {
      return res.status(400).json({
        success: false,
        error: nm.error,
      });
    }

    if (!registrationNumber) {
      return res.status(400).json({
        success: false,
        error: "Registration number is required",
      });
    }

    const rn = validateStudentRegistrationNumber(registrationNumber);
    if (!rn.valid) {
      return res.status(400).json({
        success: false,
        error: rn.error,
      });
    }

    const alreadyExists = await emailExistsAcrossAccounts(sanitizedEmail);
    if (alreadyExists) {
      return res.status(409).json({
        success: false,
        error: "User with this email already exists",
      });
    }

    const [dup] = await promisePool.query(
      "SELECT student_id FROM students WHERE registration_number = ? LIMIT 1",
      [rn.sanitized]
    );

    if (dup.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Registration number already exists",
      });
    }

    const resolvedDepartmentId = await resolveDepartmentId(
      departmentId || department
    );

    if (!resolvedDepartmentId) {
      return res.status(400).json({
        success: false,
        error: "Valid department is required",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [insertResult] = await promisePool.query(
      `INSERT INTO students
        (email, password_hash, first_name, last_name, registration_number, department_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, FALSE)`,
      [
        sanitizedEmail,
        passwordHash,
        String(firstName).trim(),
        String(lastName).trim(),
        rn.sanitized,
        resolvedDepartmentId,
      ]
    );

    pendingRegistrations.delete(sanitizedEmail);

    return res.status(201).json({
      success: true,
      message: "Registration successful. Your account will be activated after admin approval.",
      studentId: insertResult.insertId,
    });
  } catch (error) {
    console.error("verify-and-register error:", error);
    return res.status(500).json({
      success: false,
      error: "Registration failed",
    });
  }
});

// -----------------------------
// ADMIN: CREATE LECTURER
// Only primary admin
// -----------------------------
router.post("/create-lecturer", authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Forbidden: admin only",
      });
    }

    if (!isPrimaryAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: "Only the primary admin can create lecturer accounts",
      });
    }

    const {
      email,
      fullName,
      firstName,
      lastName,
      staffId,
      department,
      departmentId,
      password,
    } = req.body;

    if (!email || (!fullName && (!firstName || !lastName))) {
      return res.status(400).json({
        success: false,
        error: "Email and either fullName or firstName + lastName are required",
      });
    }

    const ev = validateEmail(email);
    if (!ev.valid) {
      return res.status(400).json({
        success: false,
        error: ev.error,
      });
    }

    const sanitizedEmail = ev.sanitized;

    const alreadyExists = await emailExistsAcrossAccounts(sanitizedEmail);
    if (alreadyExists) {
      return res.status(409).json({
        success: false,
        error: "User already exists",
      });
    }

    const names = splitName(fullName, firstName, lastName);
    const combinedName = `${names.firstName} ${names.lastName}`.trim();

    const nameValidation = validateFullName(combinedName);
    if (!nameValidation.valid) {
      return res.status(400).json({
        success: false,
        error: nameValidation.error,
      });
    }

    const resolvedDepartmentId = await resolveDepartmentId(
      departmentId || department
    );

    if (!resolvedDepartmentId) {
      return res.status(400).json({
        success: false,
        error: "Valid department is required",
      });
    }

    if (staffId) {
      const [staffExists] = await promisePool.query(
        "SELECT lecturer_id FROM lecturers WHERE staff_id = ? LIMIT 1",
        [String(staffId).trim().toUpperCase()]
      );

      if (staffExists.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Staff ID already exists",
        });
      }
    }

    const rawPassword =
      password && String(password).trim().length >= 8
        ? String(password).trim()
        : generateTempPassword();

    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const [insertResult] = await promisePool.query(
      `INSERT INTO lecturers
        (email, password_hash, first_name, last_name, staff_id, department_id, must_change_password, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE, TRUE)`,
      [
        sanitizedEmail,
        passwordHash,
        names.firstName,
        names.lastName,
        staffId ? String(staffId).trim().toUpperCase() : null,
        resolvedDepartmentId,
      ]
    );

    try {
      await sendAccountCreatedEmail({
        toEmail: sanitizedEmail,
        roleLabel: "Lecturer",
        loginIdentifier: staffId
          ? `${sanitizedEmail} / ${String(staffId).trim().toUpperCase()}`
          : sanitizedEmail,
        tempPassword: rawPassword,
      });
    } catch (mailError) {
      console.warn("Failed to send lecturer creation email:", mailError?.message);
    }

    const responsePayload = {
      success: true,
      message: "Lecturer account created successfully",
      lecturerId: insertResult.insertId,
    };

    if (password || (process.env.NODE_ENV || "development") !== "production") {
      responsePayload.tempPassword = rawPassword;
    }

    return res.status(201).json(responsePayload);
  } catch (error) {
    console.error("create-lecturer error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create lecturer",
    });
  }
});

// -----------------------------
// ADMIN: CREATE ADMIN
// Rules:
// - only primary admin (admin_id = 1)
// - max 3 admins total
// -----------------------------
router.post("/create-admin", authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Forbidden: admin only",
      });
    }

    if (!isPrimaryAdmin(req)) {
      return res.status(403).json({
        success: false,
        error: "Only the primary admin can create admin accounts",
      });
    }

    const [[countRow]] = await promisePool.query(
      "SELECT COUNT(*) AS totalAdmins FROM admins"
    );

    if (Number(countRow.totalAdmins) >= 3) {
      return res.status(400).json({
        success: false,
        error: "Maximum number of admin accounts reached",
      });
    }

    const { email, fullName, firstName, lastName, password } = req.body;

    if (!email || (!fullName && (!firstName || !lastName))) {
      return res.status(400).json({
        success: false,
        error: "Email and either fullName or firstName + lastName are required",
      });
    }

    const ev = validateEmail(email);
    if (!ev.valid) {
      return res.status(400).json({
        success: false,
        error: ev.error,
      });
    }

    const sanitizedEmail = ev.sanitized;

    const alreadyExists = await emailExistsAcrossAccounts(sanitizedEmail);
    if (alreadyExists) {
      return res.status(409).json({
        success: false,
        error: "User already exists",
      });
    }

    const names = splitName(fullName, firstName, lastName);
    const combinedName = `${names.firstName} ${names.lastName}`.trim();

    const nameValidation = validateFullName(combinedName);
    if (!nameValidation.valid) {
      return res.status(400).json({
        success: false,
        error: nameValidation.error,
      });
    }

    const rawPassword =
      password && String(password).trim().length >= 8
        ? String(password).trim()
        : generateTempPassword();

    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const [insertResult] = await promisePool.query(
      `INSERT INTO admins
        (email, password_hash, first_name, last_name, must_change_password, is_active)
       VALUES (?, ?, ?, ?, TRUE, TRUE)`,
      [sanitizedEmail, passwordHash, names.firstName, names.lastName]
    );

    try {
      await sendAccountCreatedEmail({
        toEmail: sanitizedEmail,
        roleLabel: "Admin",
        loginIdentifier: sanitizedEmail,
        tempPassword: rawPassword,
      });
    } catch (mailError) {
      console.warn("Failed to send admin creation email:", mailError?.message);
    }

    const responsePayload = {
      success: true,
      message: "Admin account created successfully",
      adminId: insertResult.insertId,
    };

    if (password || (process.env.NODE_ENV || "development") !== "production") {
      responsePayload.tempPassword = rawPassword;
    }

    return res.status(201).json(responsePayload);
  } catch (error) {
    console.error("create-admin error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create admin account",
    });
  }
});

module.exports = router;