"use strict";

const Service = require("egg").Service;
var moment = require("moment");

class TransService extends Service {
  table = "ums_chain_trans_eth";

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
    //初始化web3
    const web3 = ctx.getWeb3();
    //当前区块高度
    const curBlock = await web3.eth.getBlockNumber();
    list.forEach(async (item) => {
      //获取交易详情
      const receipt = await web3.eth.getTransactionReceipt(item.hash);
      //交易成功，并且必须相隔15个区块
      const diffBlock = curBlock - receipt.blockNumber;
      if (receipt.status == true && diffBlock > 15) {
        //交易成功，事务处理业务
        const account = await service.account.detail(item.to);
        if (!account) {
          return;
        }
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
            item.contract,
            item.token,
            item.value,
            1,
            conn
          );
          //修改状态
          await conn.update(this.table, {
            id: item.id,
            status: 1,
            submit_block: curBlock,
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
  async match(list) {
    const { app, ctx } = this;
    if (list.length == 0) {
      return;
    }
    const addresss = Object.keys(list);
    //检查出平台的钱包地址
    const results = await app.mysql.query(
      "select address from ums_chain_account where type=1 and address in (?)",
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
        if (await app.mysql.get(this.table, { hash: trans.hash })) {
          return;
        }
        //保存交易
        await app.mysql.insert(this.table, {
          from: trans.from,
          to: trans.to,
          value: ctx.helper.coinToDB(trans.value),
          token: trans.tokenSymbol,
          token_decimal: trans.tokenDecimal,
          contract: trans.contractAddress || "",
          hash: trans.hash,
          nonce: trans.nonce,
          block_hash: trans.blockHash,
          transaction_index: trans.transactionIndex,
          confirmations: trans.confirmations,
          gas_eth: trans.gasToEth,
          block_number: trans.blockNumber,
          timestamp: trans.timeStamp,
          created_at: now,
        });
      }
    });
  }
}

module.exports = TransService;
