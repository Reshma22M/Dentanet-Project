console.log("✅ RUNNING server.js from:", __filename);
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const { pool } = require("./config/database");

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------
// Routes
// -----------------------------
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const bookingRoutes = require("./routes/bookings");
const submissionRoutes = require("./routes/submissions");
const evaluationRoutes = require("./routes/evaluations");
const materialRoutes = require("./routes/materials");
const notificationRoutes = require("./routes/notifications");
const registrationRoutes = require("./routes/registration");
const moduleRoutes = require("./routes/modules");
const materialTypeRoutes = require("./routes/materialTypes");
const examRoutes = require("./routes/exams");
const examSlotRoutes = require("./routes/examSlots");
const machineRoutes = require("./routes/machines");

// -----------------------------
// Middleware
// -----------------------------
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// -----------------------------
// Database Connection Test
// -----------------------------
pool.getConnection((err, conn) => {
  if (err) {
    console.error("❌ MySQL connection failed:", err.message);
  } else {
    console.log("✅ MySQL connected to DB:", process.env.DB_NAME);
    conn.release();
  }
});

// -----------------------------
// API Routes
// -----------------------------
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/evaluations", evaluationRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/registration", registrationRoutes);
app.use("/api/modules", moduleRoutes);
app.use("/api/material-types", materialTypeRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/exam-slots", examSlotRoutes);
app.use("/api/machines", machineRoutes);

// -----------------------------
// Root Route
// -----------------------------
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "DentaNet API is running",
    timestamp: new Date().toISOString(),
  });
});

// -----------------------------
// Health Check
// -----------------------------
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    server: "running",
    timestamp: new Date().toISOString(),
  });
});

// -----------------------------
// DB Health Check
// -----------------------------
app.get("/api/health/db", (req, res) => {
  pool.query("SELECT 1 AS ok", (err, rows) => {
    if (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }

    res.json({
      ok: true,
      database: process.env.DB_NAME,
      result: rows,
    });
  });
});

// -----------------------------
// 404 Handler
// -----------------------------
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: "Endpoint not found",
      status: 404,
    },
  });
});

// -----------------------------
// Start Server
// -----------------------------
const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🦷 DentaNet LMS API Server         ║
║   ✅ Server running on port ${PORT}      
║   🌐 http://localhost:${PORT}            
║   📚 Environment: ${process.env.NODE_ENV || "development"}      
║   🗄️  Database: ${process.env.DB_NAME}            
╚═══════════════════════════════════════╝
`);
});

// -----------------------------
// Graceful Shutdown
// -----------------------------
const shutdown = (signal) => {
  console.log(`\n🛑 ${signal} received. Shutting down...`);

  server.close(() => {
    console.log("✅ HTTP server closed");

    pool.end((err) => {
      if (err) {
        console.error("⚠️ Error closing DB pool:", err.message);
      } else {
        console.log("✅ Database pool closed");
      }

      process.exit(0);
    });
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("💥 Unhandled Rejection:", reason);
});
module.exports = app; 