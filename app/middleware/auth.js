module.exports = (option, app) => {
  return async (ctx, next) => {
    // 1.获取token
    let token = ctx.header.token || ctx.query.token;
    if (!token) {
      return ctx.apiFail(408, "您没有权限访问");
    }

    const params = await ctx.verifyToken(token);
    if (params === false) {
      return ctx.apiFail(405, "登录已过期，请重新登录");
    }

    // 5.挂在到全局ctx
    ctx.params = params;

    await next();
  };
};
