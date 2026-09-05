/**
 * Attaches res.success / res.error so controllers stay uniform.
 * Mirrors the response shape used across the HRMS codebase.
 */
const responseMiddleware = (req, res, next) => {
  res.success = (statusCode = 200, data = {}, message = "Success") =>
    res.status(statusCode).json({ success: true, statusCode, message, data });

  res.error = (statusCode = 500, message = "Something went wrong") =>
    res.status(statusCode).json({ success: false, statusCode, message });

  next();
};

module.exports = responseMiddleware;
