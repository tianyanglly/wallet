"use strict";

const Service = require("egg").Service;
const { ethers } = require("ethers");
var moment = require("moment");
const { generateAccount } = require("tron-create-address");

class AccountService extends Service {
  table = "ums_chain_account";

  //检查交易
  async detail(address) {
    const { app } = this;
    return await app.mysql.get(this.table, { address });
  }

  //创建以太坊钱包
  async createEth(user_id) {
    const account = await this.app.mysql.get(this.table, {
      user_id,
      type: 1,
    });
    if (account) {
      return account.address;
    }
    const privateKey = ethers.utils.randomBytes(32);
    const wallet = new ethers.Wallet(privateKey);
    const key = ethers.BigNumber.from(privateKey)._hex;
    const encKey = this.ctx.helper.aesEcbEncrypt(key);

    //保存入库
    const now = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
    const result = await this.app.mysql.insert("ums_chain_account", {
      user_id,
      address: wallet.address,
      key: encKey,
      type: 1,
      created_at: now,
      updated_at: now,
    });
    if (result.affectedRows === 1) {
      return wallet.address;
    }
    return false;
  }

  async createTron(user_id) {
    const account = await this.app.mysql.get(this.table, {
      user_id,
      type: 2,
    });
    if (account) {
      return account.address;
    }
    const { address, privateKey } = generateAccount();

    const encKey = this.ctx.helper.aesEcbEncrypt(privateKey);
    //保存入库
    const now = moment(Date.now()).format("YYYY-MM-DD HH:mm:ss");
    const result = await this.app.mysql.insert(this.table, {
      user_id,
      address,
      key: encKey,
      type: 2,
      created_at: now,
      updated_at: now,
    });
    if (result.affectedRows === 1) {
      return address;
    }
    return false;
  }
}

module.exports = AccountService;
