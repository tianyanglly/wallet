//打包交易
module.exports = {
  schedule: {
    interval: "30s", // 1 分钟间隔
    type: "worker", // 指定所有的 worker 都需要执行
    immediate: true,
    disable: false,
  },
  async task(ctx) {
    try {
      await ctx.service.balance.packageTrans();
    } catch (e) {
      ctx.logger.error("schedule packageTrans err:%s", e);
    }
    try {
      await ctx.service.balance.sendTronTrans();
    } catch (e) {
      ctx.logger.error("schedule sendTronTrans err:%s", e);
    }
  },
};
