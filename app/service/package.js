"use strict";

const Service = require("egg").Service;
var moment = require("moment");

class PackageService extends Service {
  table = "ums_chain_trans_package";

  //发送交易
  async sendTrans(txObj) {
    const { app, ctx, service } = this;
    if (!txObj) return;
    const now = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
    let insertData = {
      from: txObj.from,
      to: txObj.to,
      value: 0,
      nonce: txObj.nonce,
      gas_price: txObj.gasPrice,
      gas_limit: txObj.gasLimit,
      data: txObj.data,
      created_at: now,
    };
    const account = await service.account.detail(txObj.from);
    if (!account) return;
    const priKey = ctx.helper.aesEcbDecrypt(account.key);
    const txData = ctx.helper.signTransaction(txObj, priKey);
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
        //账户地址初始化
        await service.balance.initStatus(txObj.from, txObj.to);
      })
      .on("error", async (error) => {
        ctx.logger.error("sendTransaction err:%s", error);
      });
  }
}

module.exports = PackageService;
