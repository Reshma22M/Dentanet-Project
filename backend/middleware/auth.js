const jwt = require("jsonwebtoken");

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    // Normalize user object so routes can use req.user.id and req.user.role safely
    req.user = {
      id:
        decoded.id ||
        decoded.user_id ||
        decoded.lecturer_id ||
        decoded.student_id ||
        decoded.admin_id ||
        null,
      role: decoded.role || null,
      email: decoded.email || null,
      ...decoded,
    };

    if (!req.user.id || !req.user.role) {
      return res.status(403).json({
        error: "Invalid token payload. User id or role missing.",
      });
    }

    next();
  });
};

const authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Access denied. Insufficient permissions.",
      });
    }

    next();
  };
};

module.exports = { authenticateToken, authorizeRole };