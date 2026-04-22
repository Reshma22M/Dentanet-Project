const jwt = require("jsonwebtoken");

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  // Accept standard "Bearer <token>" format only.
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

    // Normalize token payload so all routes can safely rely on req.user.id + req.user.role.
    req.user = {
      ...decoded,
      id:
        decoded.id ||
        decoded.user_id ||
        decoded.lecturer_id ||
        decoded.student_id ||
        decoded.admin_id ||
        null,
      role: decoded.role || null,
      email: decoded.email || null,
    };

    if (!req.user.id || !req.user.role) {
      return res.status(403).json({
        error: "Invalid token payload. User id or role missing.",
      });
    }

    // Pass authenticated user context to the next middleware/route.
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

    // User has one of the allowed roles for this route.
    next();
  };
};

module.exports = { authenticateToken, authorizeRole };
