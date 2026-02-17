function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: {
      message: "Route not found",
      path: req.originalUrl,
    },
  });
}

function errorHandler(err, req, res, next) {
  // Postgres: unique violation (duplicate key)
  // code 23505 = unique_violation
  if (err && err.code === "23505") {
    return res.status(409).json({
      error: {
        message: "Resource already exists",
      },
    });
  }

  const status = err.statusCode || 500;

  res.status(status).json({
    error: {
      message: err.message || "Internal server error",
    },
  });
}

module.exports = { notFoundHandler, errorHandler };

