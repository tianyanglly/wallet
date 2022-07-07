"use strict";

const Service = require("egg").Service;
var moment = require("moment");

class PackageGasService extends Service {
  table = "ums_chain_trans_gas_package";

  //发送交易
  async sendTrans(txStr) {
    const { app, ctx, service } = this;
    let { gas, tx } = JSON.parse(txStr);
    if (!gas || !tx) return;
    //获取nonce
    const nonce = await ctx.helper.getAddressNonce(gas.from);
    gas.nonce = nonce;
    const now = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
    let insertData = {
      to: gas.to,
      value: gas.value,
      nonce,
      gas_price: gas.gasPrice,
      gas_limit: gas.gasLimit,
      created_at: now,
    };
    const txData = ctx.helper.signTransaction(gas, ctx.helper.getGasEthKey());
    ctx.helper
      .sendTransaction(txData)
      .on("transactionHash", async (hash) => {
        insertData.hash = hash;
        return await app.mysql.insert(this.table, insertData);
      })
      .on("receipt", async (receipt) => {
        await app.mysql.update(
          this.table,
          { status: 1 },
          { where: { hash: receipt.transactionHash } }
        );
        await service.package.sendTrans(tx);
      })
      .on("error", async (error) => {
        ctx.logger.error("sendTransaction gas err:%s", error);
      });
  }
}

module.exports = PackageGasService;
