/**
 * Attaches res.success / res.error so controllers stay uniform.
 * Mirrors the response shape used across the HRMS codebase.
 */
const responseMiddleware = (req, res, next) => {
  res.success = (statusCode = 200, data = {}, message = "Success") =>
    res.status(statusCode).json({ success: true, statusCode, message, data });

  /**
   * `data` is optional and omitted entirely when not passed, so every existing
   * call produces exactly the same body as before.
   *
   * It exists for failures that carry a *report* rather than a sentence — the
   * bulk importer rejecting a file needs to hand back every problem it found,
   * and squeezing two hundred of those into `message` would make the one
   * feature whose job is "tell me everything that's wrong at once" useless.
   */
  res.error = (statusCode = 500, message = "Something went wrong", data) =>
    res.status(statusCode).json({
      success: false,
      statusCode,
      message,
      ...(data === undefined ? {} : { data }),
    });

  next();
};

module.exports = responseMiddleware;
