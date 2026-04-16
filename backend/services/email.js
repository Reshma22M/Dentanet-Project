const nodemailer = require("nodemailer");

let transporter = null;

function pickEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

function toBool(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function getMailConfig() {
  const host = pickEnv("SMTP_HOST", "MAIL_HOST", "EMAIL_HOST");
  const service = pickEnv("SMTP_SERVICE", "MAIL_SERVICE", "EMAIL_SERVICE");
  const portRaw = pickEnv("SMTP_PORT", "MAIL_PORT", "EMAIL_PORT");
  const user = pickEnv("SMTP_USER", "MAIL_USER", "EMAIL_USER", "SMTP_USERNAME");
  const pass = pickEnv("SMTP_PASS", "MAIL_PASS", "EMAIL_PASS", "SMTP_PASSWORD");
  const from = pickEnv("SMTP_FROM", "MAIL_FROM", "EMAIL_FROM") || user;
  const secure = toBool(pickEnv("SMTP_SECURE", "MAIL_SECURE", "EMAIL_SECURE"), false);
  const port = Number(portRaw || (secure ? 465 : 587));

  return {
    host,
    service,
    port: Number.isFinite(port) ? port : (secure ? 465 : 587),
    secure,
    user,
    pass,
    from
  };
}

function hasSmtpConfig() {
  const config = getMailConfig();
  const hasProvider = Boolean(config.host || config.service);
  return Boolean(hasProvider && config.user && config.pass);
}

function getTransporter() {
  if (!hasSmtpConfig()) return null;
  if (transporter) return transporter;

  const config = getMailConfig();

  transporter = nodemailer.createTransport({
    host: config.host || undefined,
    service: config.service || undefined,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });

  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  const mailer = getTransporter();
  if (!mailer) {
    return {
      ok: false,
      skipped: true,
      error: "SMTP configuration is missing"
    };
  }

  if (!to || !subject || (!html && !text)) {
    return {
      ok: false,
      skipped: true,
      error: "Missing required email fields"
    };
  }

  try {
    const config = getMailConfig();

    await mailer.sendMail({
      from: config.from,
      to,
      subject,
      html: html || undefined,
      text: text || undefined
    });

    return { ok: true };
  } catch (error) {
    console.error("sendEmail failed:", error.message || error);
    return {
      ok: false,
      skipped: false,
      error: error.message || "Email send failed"
    };
  }
}

module.exports = {
  sendEmail,
  hasSmtpConfig
};
