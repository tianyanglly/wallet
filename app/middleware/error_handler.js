module.exports = (option, app) => {
  return async function (ctx, next) {
    try {
      await next();

      if (ctx.status === 404 && !ctx.body) {
        ctx.body = {
          msg: "not found",
          code: 404,
        };
      }
    } catch (err) {
      ctx.logger.error(err);

      ctx.body = { msg: err.message, code: 500 };
      ctx.status = err.status || 500;
    }
  };
};
