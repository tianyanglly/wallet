//确认交易是否成功并打包
module.exports = {
  schedule: {
    interval: "15s", // 1 分钟间隔
    type: "worker", // 指定所有的 worker 都需要执行
    immediate: true,
    disable: false,
  },
  async task(ctx) {
    const limit = 50;
    let page = 1;
    while (true) {
      try {
        const count = await ctx.service.trans.check(page, limit);
        if (count < limit) {
          break;
        }
      } catch (e) {
        ctx.logger.error("schedule check err:%s", e);
        break;
      }
      page++;
    }
  },
};
