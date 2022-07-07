var moment = require("moment");

//获取流动性比值
module.exports = {
  schedule: {
    interval: "1h", // 1 分钟间隔
    type: "worker", // 指定所有的 worker 都需要执行
    immediate: true,
    disable: false,
  },
  async task(ctx) {
    const rate = await ctx.helper.getTokenRate();
    const db = ctx.app.mysql;
    const now = moment(Date.now()).format("YYYY-MM-DD HH:00:00");
    await db.insert("ums_chain_token_rate", {
      rate: parseInt(rate * 1000000),
      date: now,
    });
  },
};
