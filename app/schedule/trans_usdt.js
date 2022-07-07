//获取链上的usdt合约的所有交易
module.exports = {
  schedule: {
    interval: "10s", // 1 分钟间隔
    type: "worker", // 指定所有的 worker 都需要执行
    immediate: true,
    disable: false,
  },
  async task(ctx) {
    const db = ctx.app.mysql;
    const info = await db.get("cms_system_config", { key: "eth_block_number" });
    const startblock = info.value;

    let endBlock = startblock;

    const offset = 100;
    let page = 1;
    while (true) {
      try {
        let { list, lastBlock } = await ctx.helper.getTransactionList(
          ctx.app.config.bsc.api,
          {
            module: "account",
            action: "tokentx",
            contractaddress: ctx.app.config.bsc.tokens.usdt.address,
            startblock,
            page,
            offset,
            apikey: ctx.app.config.bsc.apiKey,
          }
        );
        if (lastBlock > endBlock) {
          endBlock = lastBlock;
        }
        if (lastBlock == 0) {
          break;
        }
        await ctx.service.trans.match(list);
      } catch (e) {
        ctx.logger.error("schedule usdt err:%s", e);
        break;
      }
      await ctx.helper.sleep(3000);
      page++;
    }
    await db.update("cms_system_config", { id: info.id, value: endBlock });
  },
};
