function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    message: err.message || "Internal server error.",
    errors: err.errors || null
  });
}

module.exports = { errorHandler };

