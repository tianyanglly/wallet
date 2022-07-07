"use strict";

var CryptoJS = require("crypto-js");
const TronWeb = require("tronweb");
const { Decimal } = require("decimal.js");
const fs = require("fs");
const Tx = require("ethereumjs-tx");

module.exports = {
  /**
   * 获取eth 余额
   * @param {string} address
   * @returns
   * @memberof EthModel
   */
  async getEthAmount(address) {
    const web3 = this.ctx.getWeb3();
    const amount = await web3.eth.getBalance(address);
    return web3.utils.fromWei(amount, "ether");
  },

  /**
   * 获取转移所需手续费
   * @param {string} from
   * @param {string} to
   * @param {(number| string)} value
   * @returns
   * @memberof EthModel
   */
  async calcEthGas(from, to, value) {
    const web3 = this.ctx.getWeb3();
    const gasPrice = await this.getGasPrice();
    const gasLimit = await web3.eth.estimateGas({
      gasPrice,
      value: web3.utils.toWei(value.toString(), "ether"),
    });

    return {
      gasLimit,
      gasPrice,
      gasToEth: web3.utils.fromWei(
        new Decimal(gasPrice).mul(gasLimit).toFixed()
      ),
    };
  },

  /**
   * 获取tron转移所需手续费
   * @param {string} from
   * @param {string} to
   * @param {(number| string)} value
   * @returns
   * @memberof EthModel
   */
  async calcTronGas(contract, from, to, amount) {
    const tronWeb = this.ctx.getTronWeb();
    const parameter1 = [
      { type: "address", value: from },
      { type: "uint256", value: amount },
    ];
    const transaction =
      await tronWeb.transactionBuilder.triggerConstantContract(
        contract,
        "transfer(address,uint256)",
        {},
        parameter1,
        to
      );
    return transaction.energy_used;
  },

  /**
   * 计算最多可发送eth数量
   * @param {string} from
   * @param {string} to
   * @returns
   * @memberof EthModel
   */
  async calcMaxSendEthAmount(from, to) {
    const gasObj = await this.calcEthGas(from, to, 0);
    const ethAmount = await this.getEthAmount(from);
    return new Decimal(ethAmount).mul(gasObj.gasToEth).toString();
  },

  /**
   * 合约初始化
   * @memberof TokenModel
   */
  contractInit(address, name = "token") {
    const { ctx } = this;
    const web3 = ctx.getWeb3();
    const abi = this.buildAbi();
    return new web3.eth.Contract(abi[name], address);
  },

  /**
   * 获取代币余额
   * @param {string} address
   * @returns
   * @memberof TokenModel
   */
  async getTokenAmount(contractInstance, address, decimal = 18) {
    const tokenAmount = await contractInstance.methods
      .balanceOf(address)
      .call();
    return new Decimal(tokenAmount).div(10 ** decimal).toString();
  },

  /**
   * 构建转账参数
   * @param {string} to
   * @param {(string|number)} tokenAmount
   * @returns
   * @memberof TokenModel
   */
  async buildTransactionAbiData(
    contractInstance,
    to,
    tokenAmount,
    decimal = 18
  ) {
    tokenAmount = new Decimal(tokenAmount).mul(10 ** decimal).toString();
    const abiData = await contractInstance.methods
      .transfer(to, tokenAmount)
      .encodeABI();
    return abiData;
  },

  /**
   * 计算发送代币所需的eth
   * @param {string} from
   * @param {string} to
   * @param {(string|number)} tokenAmount
   * @returns
   * @memberof TokenModel
   */
  async calcTokenGas(contractInstance, from, to, tokenAmount, decimal = 18) {
    const web3 = this.ctx.getWeb3();
    const gasPrice = await this.getGasPrice();
    tokenAmount = new Decimal(tokenAmount).mul(10 ** decimal).toString();
    const gasLimit = await contractInstance.methods
      .transfer(to, tokenAmount)
      .estimateGas({
        from: this.app.config.contractCalcGasAddress,
      });
    return {
      gasPrice,
      gasLimit,
      gasToEth: web3.utils.fromWei(
        new Decimal(gasPrice).mul(gasLimit).toFixed(),
        "ether"
      ),
    };
  },

  /**
   * 构建代币转移TxObj
   * @param {string} contractAddress
   * @param {string} from
   * @param {string} to
   * @param {(string| number)} [amount='all']
   * @returns
   * @memberof TransactionModel
   */
  async buildTokenTransaction(contractAddress, from, to, amount = 0) {
    let data;
    const contractInstance = this.contractInit(contractAddress);
    if (amount == 0) {
      //默认发送全部币
      amount = await this.getTokenAmount(contractInstance, from);
      data = await this.buildTransactionAbiData(contractInstance, to, amount);
    } else {
      const web3 = this.ctx.getWeb3();
      let balance = await contractInstance.methods.balanceOf(from);
      balance = web3.utils.fromWei(balance, "ether");
      if (balance < amount) {
        throw new Error("余额不足");
      }
      data = await this.buildTransactionAbiData(contractInstance, to, amount);
    }
    const gasObj = await this.calcTokenGas(contractInstance, from, to, amount);
    const nonce = await this.getAddressNonce(from);

    return {
      from,
      to: contractAddress,
      nonce,
      gasPrice: gasObj.gasPrice,
      gasLimit: gasObj.gasLimit,
      data,
    };
  },

  gasEth(gasPrice, gasLimit) {
    const web3 = this.ctx.getWeb3();
    return web3.utils.fromWei(
      new Decimal(gasPrice).mul(gasLimit).toFixed(),
      "ether"
    );
  },

  /**
   * 构建Eth 转移
   * @param {string} from
   * @param {string} to
   * @param {(string|number)} [amount]
   * @memberof TransactionModel
   */
  async buildEthTransaction(from, to, amount = 0) {
    const web3 = this.ctx.getWeb3();
    let gasObj = {};

    if (amount === 0) {
      amount = await this.getEthAmount(from);
      gasObj = await this.calcEthGas(from, to, amount);
      amount = new Decimal(amount).sub(gasObj.gasToEth).toString();
    } else {
      gasObj = await this.calcEthGas(from, to, amount);
    }

    return {
      from,
      to,
      gasPrice: gasObj.gasPrice,
      gasLimit: gasObj.gasLimit,
      value: web3.utils.toWei(amount.toString(), "ether"),
    };
  },

  /**
   * 签名交易
   * @param {object} transaction
   * @param {string} privateKey
   * @returns
   * @memberof TransactionModel
   */
  signTransaction(transaction, privateKey) {
    const web3 = this.ctx.getWeb3();
    Object.keys(transaction).map((key) => {
      if (["to", "data"].includes(key) === false) {
        transaction[key] = web3.utils.toHex(transaction[key]);
      }
    });
    const bufferKey = Buffer.from(privateKey.replace("0x", ""), "hex");
    const tx = new Tx(transaction);
    tx.sign(bufferKey);
    const serializedTx = tx.serialize();
    return `0x${serializedTx.toString("hex")}`;
  },

  /**
   * 发送交易
   * @param {string} Tx
   * @returns
   * @memberof TransactionModel
   */
  sendTransaction(Tx) {
    const web3 = this.ctx.getWeb3();
    return web3.eth.sendSignedTransaction(Tx);
  },

  async getGasPrice(amount = 0) {
    const web3 = this.ctx.getWeb3();
    if (amount > 0) {
      return web3.utils.toWei(amount.toString(), "gwei");
    }
    if (!isNaN(parseInt(this.app.config.gasPrice))) {
      return web3.utils.toWei(this.app.config.gasPrice, "gwei");
    } else {
      return await web3.eth.getGasPrice();
    }
  },

  checkAddress(address) {
    const web3 = this.ctx.getWeb3();
    address = web3.utils.toChecksumAddress(address);
    web3.utils.checkAddressChecksum(address);
    return address;
  },

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  buildAbi() {
    try {
      const abi = fs.readFileSync(this.ctx.app.config.contractPath, "utf8");
      return JSON.parse(abi);
    } catch (err) {
      ctx.logger.error("buildAbi err:%s", e);
    }
  },

  async getAddressNonce(address) {
    const web3 = this.ctx.getWeb3();
    return await web3.eth.getTransactionCount(address);
  },

  async getChainId() {
    const web3 = this.ctx.getWeb3();
    return await web3.eth.getChainId();
  },

  /**
   * AES-256-ECB对称加密
   * @param text {string} 要加密的明文
   * @param secretKey {string} 密钥，43位随机大小写与数字
   * @returns {string} 加密后的密文，Base64格式
   */
  aesEcbEncrypt(text) {
    var keyHex = CryptoJS.enc.Base64.parse("");
    var messageHex = CryptoJS.enc.Utf8.parse(text);
    var encrypted = CryptoJS.AES.encrypt(messageHex, keyHex, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.toString();
  },

  /**
   * AES-256-ECB对称解密
   * @param textBase64 {string} 要解密的密文，Base64格式
   * @param secretKey {string} 密钥，43位随机大小写与数字
   * @returns {string} 解密后的明文
   */
  aesEcbDecrypt(textBase64) {
    var keyHex = CryptoJS.enc.Base64.parse("");
    var decrypt = CryptoJS.AES.decrypt(textBase64, keyHex, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return CryptoJS.enc.Utf8.stringify(decrypt);
  },

  //币入库放大 1000000倍
  coinToDB(value) {
    return parseInt(value * 1000000, 10);
  },

  //币出库缩小 1000000倍
  coinGetDB(value) {
    return parseFloat(value / 1000000);
  },

  async getSourceTransactionList(url, params) {
    const queryString = this.paresQuery(params);
    try {
      const res = await this.ctx.curl(url + queryString, {
        dataType: "json",
        timeout: 3000,
      });
      if (res.status != 200) {
        return [];
      }
      if (res.data.status != 1) {
        return [];
      }
      return res.data.result;
    } catch (err) {
      this.logger.error(err);
      return [];
    }
  },

  async getTransactionList(url, params) {
    const queryString = this.paresQuery(params);
    try {
      const res = await this.ctx.curl(url + queryString, {
        dataType: "json",
        timeout: 3000,
      });
      let list = {};
      let lastBlock = 0;
      if (res.status != 200) {
        return { list, lastBlock };
      }
      if (res.data.status != 1) {
        return { list, lastBlock };
      }
      for (const transaction of res.data.result) {
        list[transaction.to.toLowerCase()] =
          this.handleTransaction(transaction);
        if (transaction.blockNumber > lastBlock) {
          lastBlock = transaction.blockNumber;
        }
      }
      return { list, lastBlock };
    } catch (err) {
      this.logger.error(err);
      return { list: [], lastBlock: 0 };
    }
  },

  async getTronTransactionList(url) {
    const { ctx } = this;
    try {
      const res = await this.ctx.curl(url, {
        // 自动解析 JSON response
        dataType: "json",
        // 3 秒超时
        timeout: 3000,
        headers: {
          "TRON-PRO-API-KEY": ctx.app.config.tron.apiKey,
          "Content-Type": "application/json",
        },
      });
      let list = {};
      let lastBlock = 0;
      if (res.status != 200) {
        return { list, next: "", lastBlock };
      }
      if (res.data.data.length == 0) {
        return { list, next: "", lastBlock };
      }
      for (const transaction of res.data.data) {
        const trans = this.handleTronTransaction(transaction);
        if (!trans) continue;
        list[trans.to.toLowerCase()] = trans;
        if (trans.block_timestamp > lastBlock) {
          lastBlock = transaction.block_timestamp;
        }
      }
      const next = res.data.meta.links ? res.data.meta.links.next : "";
      return { list, next, lastBlock };
    } catch (err) {
      this.logger.error(err);
      return { list: [], next: "", lastBlock: 0 };
    }
  },

  handleTronTransaction(transaction) {
    const { ctx } = this;
    let data = transaction.raw_data.contract[0].parameter.value.data;
    if (!data) {
      return false;
    }
    //特殊处理，不然报错，41 => 0x
    data = data.replace("0000041", "0000000");
    const dataArr = ctx.decodeTronParams(["address", "uint256"], data, true);
    return {
      txid: transaction.txID,
      block_timestamp: transaction.block_timestamp,
      block_number: transaction.blockNumber,
      from: transaction.raw_data.contract[0].parameter.value.owner_address,
      to: TronWeb.address.fromHex(dataArr[0]),
      value: dataArr[1].toString(),
    };
  },

  handleTransaction(transaction) {
    transaction["gasToEth"] = new Decimal(transaction.gas)
      .mul(transaction.gasPrice)
      .div(10 ** 18)
      .toFixed();
    if (transaction.tokenSymbol !== undefined) {
      transaction["value"] = new Decimal(transaction.value)
        .div(10 ** transaction.tokenDecimal)
        .toFixed();
    } else {
      transaction.value = new Decimal(transaction.value)
        .div(10 ** 18)
        .toFixed();
    }
    return transaction;
  },

  paresQuery(obj) {
    let queryString = "?";
    Object.keys(obj).map((key) => {
      queryString += key + "=" + obj[key] + "&";
    });
    return queryString;
  },

  getGasTronKey() {
    return "";
  },

  getGasEthKey() {
    return "";
  },

  async getTokenRate() {
    const { ctx } = this;
    const router = this.contractInit(ctx.app.config.pancakeRouter, "pancake");

    const web3 = ctx.getWeb3();
    const uint = web3.utils.toWei("1", "ether");
    const path = [
      ctx.app.config.bsc.tokens.aha.address,
      ctx.app.config.bsc.tokens.usdt.address,
    ];
    const amount = await router.methods.getAmountsOut(uint, path).call();
    return web3.utils.fromWei(amount[1], "ether");
  },
};
