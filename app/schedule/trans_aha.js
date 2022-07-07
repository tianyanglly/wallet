//获取链上的usdt合约的所有交易
module.exports = {
  schedule: {
    interval: "10m", // 1 分钟间隔
    type: "worker", // 指定所有的 worker 都需要执行
    immediate: true,
    disable: false,
  },
  async task(ctx) {
    const db = ctx.app.mysql;
    const info = await db.get("cms_system_config", {
      key: "eth_block_aha_number",
    });
    const startblock = info.value;

    let endBlock = startblock;

    const offset = 100;
    let page = 1;
    const contract = ctx.helper.contractInit(
      ctx.app.config.bsc.tokens.aha.address
    );
    const web3 = ctx.getWeb3();
    while (true) {
      try {
        const list = await ctx.helper.getSourceTransactionList(
          ctx.app.config.bsc.api,
          {
            module: "account",
            action: "tokentx",
            contractaddress: ctx.app.config.bsc.tokens.aha.address,
            startblock,
            page,
            offset,
            apikey: ctx.app.config.bsc.apiKey,
          }
        );
        if (list.length == 0) {
          break;
        }
        let addresss = {};
        list.forEach((item) => {
          if (item.blockNumber > endBlock) {
            endBlock = item.blockNumber;
          }
          if (item.from != "0x0000000000000000000000000000000000000000") {
            addresss[item.from] = 1;
          }
          if (item.to != "0x0000000000000000000000000000000000000000") {
            addresss[item.to] = 1;
          }
        });
        Object.keys(addresss).forEach(async (address) => {
          let value = await contract.methods.balanceOf(address).call();
          if (value == 0) {
            return;
          }
          value = web3.utils.fromWei(value, "ether");
          value = parseInt(value * 1000000);
          let result = await db.get("ums_chain_token_aha", { address });
          if (result) {
            await db.update("ums_chain_token_aha", { id: result.id, value });
          } else {
            await db.insert("ums_chain_token_aha", { address, value });
          }
        });
      } catch (e) {
        ctx.logger.error("schedule aha err:%s", e);
        break;
      }
      await ctx.helper.sleep(5000);
      page++;
    }
    await db.update("cms_system_config", { id: info.id, value: endBlock });
  },
};
