const express = require("express");
const path = require("path");
const config = require("./config/env");
const {
  helmetMiddleware,
  corsMiddleware,
  apiLimiter,
} = require("./middleware/security");
const errorHandler = require("./middleware/errorHandler");
const authRoutes = require("./routes/authRoutes"),
  teamRoutes = require("./routes/teamRoutes"),
  studentRoutes = require("./routes/studentRoutes"),
  announcementRoutes = require("./routes/announcementRoutes"),
  supportRoutes = require("./routes/supportRoutes"),
  problemRoutes = require("./routes/problemRoutes"),
  adminTeamRoutes = require("./routes/adminTeamRoutes");
const app = express(),
  rootDir = path.resolve(__dirname, "..");
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api", apiLimiter);
app.get("/api/health", (req, res) =>
  res.json({
    status: "ONLINE",
    system: "NEXXUS / NEXXATHON",
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    maxTeamCapacity: 4,
  }),
);
app.get("/api/health/supabase", async (req, res) => {
  const service = require("./services/supabaseService");
  try {
    const result = await service.checkConnection();
    res.json({ success: true, database: "ONLINE", baseUrl: result.baseUrl });
  } catch (err) {
    res
      .status(503)
      .json({ success: false, database: "OFFLINE", error: err.message });
  }
});
app.use("/api/admin", authRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/admin", studentRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/problems", problemRoutes);
app.use("/api/admin", adminTeamRoutes);
app.use(express.static(rootDir));
app.get("/admin", (req, res) => res.sendFile(path.join(rootDir, "admin.html")));
app.get("*", (req, res) => {
  if (req.path.includes(".") && !req.path.endsWith(".html"))
    return res.status(404).send("Not Found");
  res.sendFile(path.join(rootDir, "index.html"));
});
app.use(errorHandler);
let server = null;
if (require.main === module) {
  if (
    !config.supabaseUrl ||
    !config.supabaseSecretKey ||
    !config.encryptionKey ||
    !config.jwtSecret ||
    !config.adminPassword
  ) {
    console.warn(
      "Warning: required environment variables are missing. Configure .env before production use.",
    );
  }
  server = app.listen(config.port, "0.0.0.0", () =>
    console.log(`NEXXUS server listening on ${config.port}`),
  );
}
module.exports = app;
module.exports.app = app;
module.exports.server = server;
