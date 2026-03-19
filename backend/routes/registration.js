const express = require('express');
const router = express.Router();
const { promisePool } = require('../config/database');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const { authenticateToken } = require('../middleware/auth');
const {
  validateEmail,
  validatePassword,
  validateFullName,
  validateStudentRegistrationNumber
} = require('../middleware/validators');

// transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
});

const pendingRegistrations = new Map();

const ensureDepartment = async (deptName) => {
  if (!deptName) return null;

  const [rows] = await promisePool.query(
    'SELECT department_id FROM departments WHERE department_name = ?',
    [deptName]
  );

  if (rows.length > 0) return rows[0].department_id;

  const [ins] = await promisePool.query(
    'INSERT INTO departments (department_name) VALUES (?)',
    [deptName]
  );

  return ins.insertId;
};

function generateOTP() {
  return String(crypto.randomInt(100000, 999999));
}

// ============ SEND OTP ============
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const ev = validateEmail(email);
    if (!ev.valid) {
      return res.status(400).json({ error: ev.error });
    }

    const sanitized = ev.sanitized;

    const [existsA] = await promisePool.query(
      'SELECT admin_id FROM admins WHERE email = ?',
      [sanitized]
    );
    const [existsS] = await promisePool.query(
      'SELECT student_id FROM students WHERE email = ?',
      [sanitized]
    );
    const [existsL] = await promisePool.query(
      'SELECT lecturer_id FROM lecturers WHERE email = ?',
      [sanitized]
    );

    if (existsA.length > 0 || existsS.length > 0 || existsL.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    pendingRegistrations.set(sanitized, {
      otp: String(otp).trim(),
      expiresAt
    });

    console.log('SEND OTP email:', sanitized);
    console.log('SEND OTP code:', otp);

    await transporter.sendMail({
      from: `"DentaNet LMS" <${process.env.SMTP_USER}>`,
      to: sanitized,
      subject: 'DentaNet OTP Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>DentaNet Email Verification</h2>
          <p>Your OTP code is:</p>
          <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; margin: 20px 0;">
            ${otp}
          </div>
          <p>This code expires in 10 minutes.</p>
        </div>
      `
    });

    return res.json({ message: 'OTP sent successfully' });
  } catch (e) {
    console.error('send-otp error', e);
    return res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// ============ VERIFY + REGISTER (students only) ============
router.post('/verify-and-register', async (req, res) => {
  try {
    const {
      email,
      otp,
      password,
      firstName,
      lastName,
      registrationNumber,
      department
    } = req.body;

    if (!email || !otp || !password || !firstName || !lastName) {
      return res.status(400).json({
        error: 'Email, OTP, password, first name and last name are required'
      });
    }

    const ev = validateEmail(email);
    if (!ev.valid) {
      return res.status(400).json({ error: ev.error });
    }

    const sanitized = ev.sanitized;
    const pending = pendingRegistrations.get(sanitized);

    console.log('VERIFY email raw:', email);
    console.log('VERIFY email sanitized:', sanitized);
    console.log('VERIFY otp entered:', otp);
    console.log('MAP stored entry:', pending);

    if (!pending) {
      return res.status(400).json({ error: 'No OTP requested for this email' });
    }

    if (Date.now() > pending.expiresAt) {
      pendingRegistrations.delete(sanitized);
      return res.status(400).json({ error: 'OTP expired' });
    }

    if (String(pending.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    const pw = validatePassword(password, sanitized);
    if (!pw.valid) {
      return res.status(400).json({ error: pw.error });
    }

    const combinedName = `${firstName} ${lastName}`.trim();
    const nm = validateFullName(combinedName);
    if (!nm.valid) {
      return res.status(400).json({ error: nm.error });
    }

    if (!registrationNumber) {
      return res.status(400).json({ error: 'Registration number required' });
    }

    const rn = validateStudentRegistrationNumber(registrationNumber);
    if (!rn.valid) {
      return res.status(400).json({ error: rn.error });
    }

    const [existsA] = await promisePool.query(
      'SELECT admin_id FROM admins WHERE email = ?',
      [sanitized]
    );
    const [existsS] = await promisePool.query(
      'SELECT student_id FROM students WHERE email = ?',
      [sanitized]
    );
    const [existsL] = await promisePool.query(
      'SELECT lecturer_id FROM lecturers WHERE email = ?',
      [sanitized]
    );

    if (existsA.length > 0 || existsS.length > 0 || existsL.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const [dup] = await promisePool.query(
      'SELECT student_id FROM students WHERE registration_number = ?',
      [rn.sanitized]
    );

    if (dup.length > 0) {
      return res.status(409).json({ error: 'Registration number already exists' });
    }

    const deptId = await ensureDepartment(department);
    const password_hash = await bcrypt.hash(password, 10);

    const [ins] = await promisePool.query(
      `INSERT INTO students
       (email, password_hash, first_name, last_name, registration_number, department_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [sanitized, password_hash, firstName.trim(), lastName.trim(), rn.sanitized, deptId]
    );

    pendingRegistrations.delete(sanitized);

    return res.status(201).json({
      message: 'Registration successful',
      studentId: ins.insertId
    });
  } catch (e) {
    console.error('verify-and-register error', e);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// ============ ADMIN: CREATE LECTURER ============
router.post('/create-lecturer', authenticateToken, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: admin only' });
    }

    const { email, fullName, firstName, lastName, staffId, department } = req.body;

    if (!email || (!fullName && (!firstName || !lastName))) {
      return res.status(400).json({
        error: 'Email and either fullName or firstName + lastName are required'
      });
    }

    const ev = validateEmail(email);
    if (!ev.valid) {
      return res.status(400).json({ error: ev.error });
    }

    const sanitized = ev.sanitized;

    const [ea] = await promisePool.query('SELECT admin_id FROM admins WHERE email = ?', [sanitized]);
    const [es] = await promisePool.query('SELECT student_id FROM students WHERE email = ?', [sanitized]);
    const [el] = await promisePool.query('SELECT lecturer_id FROM lecturers WHERE email = ?', [sanitized]);

    if (ea.length > 0 || es.length > 0 || el.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    let fName = firstName;
    let lName = lastName;

    if ((!fName || !lName) && fullName) {
      const parts = fullName.trim().split(/\s+/);
      fName = parts[0];
      lName = parts.slice(1).join(' ') || parts[0];
    }

    const rawPassword =
      req.body.password && String(req.body.password).trim().length >= 6
        ? String(req.body.password).trim()
        : crypto.randomBytes(8).toString('hex');

    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const deptId = await ensureDepartment(department);

    const [ins] = await promisePool.query(
      `INSERT INTO lecturers
       (email, password_hash, first_name, last_name, staff_id, department_id, must_change_password, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sanitized, passwordHash, fName, lName, staffId ? staffId.toUpperCase() : null, deptId, true, true]
    );

    try {
      await transporter.sendMail({
        from: `"DentaNet LMS" <${process.env.SMTP_USER}>`,
        to: sanitized,
        subject: 'Your DentaNet Lecturer Account',
        html: `
          <p>Your lecturer account has been created.</p>
          <p><strong>Email:</strong> ${sanitized}</p>
          <p><strong>Temporary Password:</strong> <code>${rawPassword}</code></p>
          <p>Please log in and change your password.</p>
        `
      });
    } catch (mailErr) {
      console.warn('Failed to send lecturer creation email:', mailErr && mailErr.message);
    }

    const responsePayload = {
      message: 'Lecturer account created',
      lecturerId: ins.insertId
    };

    if (req.body.password || (process.env.NODE_ENV || 'development') !== 'production') {
      responsePayload.tempPassword = rawPassword;
    }

    return res.status(201).json(responsePayload);
  } catch (e) {
    console.error('create-lecturer error', e);
    return res.status(500).json({ error: 'Failed to create lecturer' });
  }
});

module.exports = router;