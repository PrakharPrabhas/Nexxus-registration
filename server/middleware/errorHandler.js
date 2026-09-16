const config = require("../config/env");

function errorHandler(err, req, res, next) {
  console.error("[SERVER_ERROR]", err);

  const statusCode = err.status || err.statusCode || 500;
  const response = {
    success: false,
    error: err.message || "Internal Server Error",
  };

  if (config.nodeEnv === "development") {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
