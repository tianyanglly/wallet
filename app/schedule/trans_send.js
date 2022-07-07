//发送交易
module.exports = {
  schedule: {
    interval: "5s", // 1 分钟间隔
    type: "worker", // 指定所有的 worker 都需要执行
    immediate: true,
    disable: false,
  },
  async task(ctx) {
    const tx = await ctx.app.redis.rpop("chain:transaction");
    if (!tx) {
      return;
    }
    try {
      await ctx.service.packageGas.sendTrans(tx);
    } catch (e) {
      ctx.logger.error("schedule sendTrans err:%s", e);
    }
  },
};
