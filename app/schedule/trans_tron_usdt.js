//波场usdt交易
module.exports = {
  schedule: {
    interval: "10s", // 1 分钟间隔
    type: "worker", // 指定所有的 worker 都需要执行
    immediate: true,
    disable: false,
  },
  async task(ctx) {
    const db = ctx.app.mysql;
    const info = await db.get("cms_system_config", {
      key: "tron_block_timestamp",
    });
    const startblock = info.value;

    let endBlock = startblock;

    const offset = 100;
    let url =
      ctx.app.config.tron.api +
      "/v1/contracts/" +
      ctx.app.config.tron.token.usdt +
      "/transactions?min_block_timestamp=" +
      startblock +
      "&limit=" +
      offset;
    while (true) {
      try {
        let { list, next, lastBlock } = await ctx.helper.getTronTransactionList(
          url
        );
        if (lastBlock > endBlock) {
          endBlock = lastBlock;
        }
        if (lastBlock == 0) {
          break;
        }

        await ctx.service.transTron.match(list);
        if (next == "") {
          break;
        }
        url = next;
      } catch (e) {
        ctx.logger.error("schedule tron_usdt err:%s", e);
        break;
      }
      await ctx.helper.sleep(3000);
    }
    await db.update("cms_system_config", { id: info.id, value: endBlock });
  },
};
