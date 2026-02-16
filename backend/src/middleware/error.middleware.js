function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: {
      message: "Route not found",
      path: req.originalUrl,
    },
  });
}

function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;

  res.status(status).json({
    error: {
      message: err.message || "Internal server error",
    },
  });
}

module.exports = { notFoundHandler, errorHandler };

