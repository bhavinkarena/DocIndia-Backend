exports.asyncHandler = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch((err) => {
      if (typeof res.error === "function") {
        return res.error(500, err.message);
      }
      return next(err);
    });
  };
};

exports.serviceHandler = (fn) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return { success: false, statusCode: 500, message: error.message };
    }
  };
};
