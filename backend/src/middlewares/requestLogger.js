const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    console.log(
      `[Request] ${req.method} ${req.path} ${res.statusCode} ${durationMs}ms`
    );
  });
  next();
};
export default requestLogger;
