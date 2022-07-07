"use strict";

const Controller = require("egg").Controller;

class EtherController extends Controller {
  async create() {
    const { ctx, service } = this;

    const { user_id, type } = ctx.params;

    let address;
    if (type == 1) {
      address = await service.account.createEth(user_id);
    } else {
      address = await service.account.createTron(user_id);
    }
    if (!address) {
      return ctx.apiFail(500, "创建失败了");
    }
    return ctx.apiSuccess({ address });
  }

  async recover() {
    const { ctx } = this;
    const web3 = ctx.getWeb3();
    const { message, signature } = ctx.params;
    const address = web3.eth.accounts.recover(message, signature);
    return ctx.apiSuccess({ address });
  }

  async tokenPrice() {
    const { ctx } = this;
    const price = await ctx.helper.getTokenRate();
    return ctx.apiSuccess({ price: parseInt(price * 1000000) });
  }

  async transfer() {
    const { app, ctx } = this;
    let { address, amount, type } = ctx.params;

    if (type == 2) {
      amount = amount * 1000000;
      //trc20
      const tronWeb = ctx.getTronWeb(ctx.helper.getGasTronKey());
      //加载合约
      let contract = await tronWeb.contract().at(app.config.tron.token.usdt);
      //获取当前合约账户余额
      const balance = await contract
        .balanceOf(app.config.tron.contractCalcGasAddress)
        .call();
      if (balance < amount) {
        return ctx.apiFail(400, "余额不足，请充值");
      }
      const txid = await contract.transfer(address, amount).send({
        feeLimit: 1000000,
      });
      return ctx.apiSuccess({ hash: txid });
    } else if (type == 1) {
      //erc20
      const txObj = await ctx.helper.buildTokenTransaction(
        app.config.bsc.tokens.usdt.address,
        app.config.contractCalcGasAddress,
        address,
        amount
      );
      const txData = ctx.helper.signTransaction(
        txObj,
        ctx.helper.getGasEthKey()
      );
      const res = await ctx.helper.sendTransaction(txData);
      return ctx.apiSuccess({ hash: res.transactionHash });
    }
    return ctx.apiFail(400, "不支持当前方式");
  }
}

module.exports = EtherController;
