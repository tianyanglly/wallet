"use strict";

const Service = require("egg").Service;
var moment = require("moment");

class BalanceService extends Service {
  table = "ums_chain_balance";

  async sendTronTrans() {
    const { app, service, ctx } = this;
    const list = await app.mysql.query(
      `select * from ${this.table} where status = 1 and type = 2 order by amount desc limit 50`
    );
    if (list.length == 0) {
      return;
    }
    const now = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
    list.forEach(async (item) => {
      const account = await service.account.detail(item.address);
      if (!account) return;
      const tronWeb = ctx.getTronWeb(ctx.helper.aesEcbDecrypt(account.key));
      //获取当前账号的trx是否够
      const trx = await tronWeb.trx.getBalance(item.address);
      if (trx < 3000000) {
        return;
      }
      //加载合约
      let contract = await tronWeb.contract().at(item.contract);
      //获取当前合约账户余额
      const amount = await contract.balanceOf(item.address).call();
      if (amount < 1) return;
      //发送代币至汇总账号
      const txid = await contract
        .transfer(app.config.tron.contractReceivAddress, amount)
        .send({
          feeLimit: 1000000,
        });
      if (txid) {
        await app.mysql.insert("ums_chain_trans_tron_package", {
          from: item.address,
          to: app.config.tron.contractReceivAddress,
          value: amount,
          txid,
          status: 1,
          created_at: now,
        });
        //初始化
        this.initStatus(item.address, item.contract);
      }
    });
  }

  async packageTrans() {
    const { app, ctx } = this;
    const list = await app.mysql.query(
      `select * from ${this.table} where status = 0 and amount > ? order by amount desc limit 50`,
      [app.config.minAmount]
    );
    if (list.length == 0) {
      return;
    }

    const tronWeb = ctx.getTronWeb(ctx.helper.getGasTronKey());
    const now = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
    list.forEach(async (item) => {
      if (item.type == 1) {
        await this.ethBuild(item);
      } else if (item.type == 2) {
        //获取主账号trx是否足够
        const mainTrx = await tronWeb.trx.getBalance(
          app.config.tron.contractCalcGasAddress
        );
        //获取当前账户的trx
        const trx = await tronWeb.trx.getBalance(item.address);
        //需要转入手续费
        const trxToAmount = 4000000 - trx;
        if (trxToAmount > 0) {
          if (mainTrx < trxToAmount) {
            //余额不足，请充值
            return;
          }
          //转入手续费
          const trxRes = await tronWeb.trx.sendTransaction(
            item.address,
            trxToAmount
          );
          if (trxRes.result) {
            await app.mysql.insert("ums_chain_trans_tron_gas_package", {
              to: item.address,
              value: trxToAmount,
              txid: trxRes.txid,
              created_at: now,
            });
          } else {
            return;
          }
        }
      }
      //设置提现中状态
      await app.mysql.update(this.table, { id: item.id, status: 1 });
    });
  }

  async ethBuild(item) {
    const { ctx, app } = this;
    const txObj = await ctx.helper.buildTokenTransaction(
      item.contract,
      item.address,
      app.config.contractReceivAddress
    );

    const txGasObj = await ctx.helper.buildEthTransaction(
      app.config.contractCalcGasAddress,
      item.address,
      ctx.helper.gasEth(txObj.gasPrice, txObj.gasLimit)
    );
    //压入队列
    await app.redis.lpush(
      "chain:transaction",
      JSON.stringify({ tx: txObj, gas: txGasObj })
    );
  }

  //增加币
  async add(address, contract, token, amount, type, conn) {
    const { app } = this;
    const balance = await app.mysql.get(this.table, { address, contract });
    const now = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
    if (balance) {
      //更新钱包币数量
      return await conn.update(this.table, {
        id: balance.id,
        amount: balance.amount + amount,
        updated_at: now,
      });
    } else {
      return await conn.insert(this.table, {
        address,
        contract,
        token,
        amount,
        type,
        created_at: now,
        updated_at: now,
      });
    }
  }

  async initStatus(address, contract) {
    await this.app.mysql.update(
      this.table,
      { status: 0, amount: 0 },
      {
        where: {
          address,
          contract,
        },
      }
    );
  }
}

module.exports = BalanceService;
