"use strict";

const Service = require("egg").Service;
var moment = require("moment");

class WalletService extends Service {
  table = "ums_chain_wallet";

  async detail(user_id, coin) {
    const { app } = this;
    return await app.mysql.get(this.table, { user_id, coin });
  }

  //增加币
  async add(user_id, coin, value, conn) {
    const { app, ctx } = this;
    const wallet = await app.mysql.get(this.table, { user_id, coin });
    const now = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
    if (wallet) {
      //更新钱包币数量
      await conn.update(this.table, {
        id: wallet.id,
        balance: wallet.balance + value,
        updated_at: now,
      });
    } else {
      await conn.insert(this.table, {
        user_id,
        coin,
        balance: value,
        created_at: now,
        updated_at: now,
      });
    }

    const token = ctx.signToken({ user_id });
    ctx.curl(app.config.payNotify + token, {
      // 3 秒超时
      timeout: 3000,
    });
  }
}

module.exports = WalletService;
