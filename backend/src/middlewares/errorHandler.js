const errorHandler = (err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.originalUrl}`, err);
  const statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);

  res.status(statusCode).json({
    message: statusCode >= 500 ? "Internal Server Error" : (err.message || "Request failed"),
  });
};

export default errorHandler;
