"use strict";

const Service = require("egg").Service;
var moment = require("moment");

class TransTronService extends Service {
  table = "ums_chain_trans_tron";

  //检查交易
  async check(page = 1, limit = 50) {
    const { app, service, ctx } = this;
    const offset = (page - 1) * limit;
    const list = await app.mysql.select(this.table, {
      where: { status: 0 },
      offset,
      limit,
    });
    if (list.length == 0) {
      return 0;
    }
    const tronWeb = ctx.getTronWeb();
    list.forEach(async (item) => {
      //获取交易详情
      const receipt = await tronWeb.trx.getTransactionInfo(item.txid);
      if (receipt.receipt && receipt.receipt.result == "SUCCESS") {
        //交易成功，事务处理业务
        const account = await service.account.detail(item.to);
        if (!account) {
          return;
        }
        const contract = ctx.formatTronAddress(receipt.contract_address);
        const conn = await app.mysql.beginTransaction(); // 初始化事务
        try {
          //钱包
          await service.wallet.add(
            account.user_id,
            item.token,
            item.value,
            conn
          );
          //链上余额记录，转账到汇总钱包使用
          await service.balance.add(
            item.to,
            contract,
            item.token,
            item.value,
            2,
            conn
          );
          //修改状态
          await conn.update(this.table, {
            id: item.id,
            status: 1,
            contract,
            token: item.token,
          });
          await conn.commit(); // 提交事务
        } catch (err) {
          // error, rollback
          await conn.rollback(); // 一定记得捕获异常后回滚事务！！
          throw err;
        }
      }
    });
    return list.length;
  }

  //匹配平台钱包地址的所有交易并保存入库
  async match(list, token = "USDT") {
    const { app } = this;
    if (list.length == 0) {
      return;
    }
    const addresss = Object.keys(list);
    //检查出平台的钱包地址
    const results = await app.mysql.query(
      "select address from ums_chain_account where type=2 and address in (?)",
      [addresss]
    );
    if (results.length == 0) {
      return;
    }
    const now = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
    results.forEach(async (val) => {
      //匹配交易
      let trans = list[val.address.toLowerCase()];
      if (trans) {
        if (await app.mysql.get(this.table, { txid: trans.txid })) {
          return;
        }
        //保存交易
        await app.mysql.insert(this.table, {
          from: trans.from,
          to: trans.to,
          value: trans.value,
          txid: trans.txid,
          token,
          block_timestamp: trans.block_timestamp,
          block_number: trans.block_number,
          created_at: now,
        });
      }
    });
  }
}

module.exports = TransTronService;
