const env = require("../config/env");

function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error.";

  if (res.headersSent) {
    return;
  }

  const body = {
    success: false,
    message
  };

  if (env.nodeEnv !== "production") {
    body.errors = err.errors || null;
  }

  res.status(statusCode).json(body);
}

module.exports = { errorHandler };

