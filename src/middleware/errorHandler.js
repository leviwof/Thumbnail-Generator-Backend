const env = require("../config/env");

function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error.";

  if (res.headersSent) {
    return;
  }

  // Always log server errors for debugging.
  if (statusCode >= 500) {
    console.error("[error-handler]", {
      statusCode,
      message,
      stack: err.stack
    });
  }

  const body = {
    success: false,
    message
  };

  if (env.nodeEnv !== "production") {
    body.errors = err.errors || null;
    body.stack = err.stack || null;
  }

  res.status(statusCode).json(body);
}

module.exports = { errorHandler };
