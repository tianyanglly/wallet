var ethers = require("ethers");
const TronWeb = require("tronweb");
var Web3 = require("web3");

const AbiCoder = ethers.utils.AbiCoder;
const ADDRESS_PREFIX = "41";

module.exports = {
  // 成功提示
  apiSuccess(data = "", msg = "ok", code = 200) {
    this.body = { code, msg, data };
  },
  // 失败提示
  apiFail(code = 400, msg = "fail") {
    this.body = { msg, code };
  },

  getWeb3() {
    return new Web3(this.app.config.bsc.web3Url);
  },

  // 生成token
  signToken(value) {
    return this.app.jwt.sign(value, this.app.config.jwt.secret);
  },
  // 验证token
  verifyToken(token) {
    return this.app.jwt.verify(token, this.app.config.jwt.secret);
  },

  getTronWeb(privateKey = "") {
    const { app } = this;
    return new TronWeb({
      fullHost: app.config.tron.api,
      headers: { "TRON-PRO-API-KEY": app.config.tron.apiKey },
      privateKey,
    });
  },

  formatTronAddress(address) {
    return TronWeb.address.fromHex(address);
  },

  //types:参数类型列表，如果函数有多个返回值，列表中类型的顺序应该符合定义的顺序
  //output: 解码前的数据
  //ignoreMethodHash：对函数返回值解码，ignoreMethodHash填写false，如果是对gettransactionbyid结果中的data字段解码时，ignoreMethodHash填写true
  decodeTronParams(types, output, ignoreMethodHash) {
    if (!output || typeof output === "boolean") {
      ignoreMethodHash = output;
      output = types;
    }

    if (ignoreMethodHash && output.replace(/^0x/, "").length % 64 === 8)
      output = "0x" + output.replace(/^0x/, "").substring(8);

    const abiCoder = new AbiCoder();

    if (output.replace(/^0x/, "").length % 64)
      throw new Error(
        "The encoded string is not valid. Its length must be a multiple of 64."
      );
    return abiCoder.decode(types, output).reduce((obj, arg, index) => {
      if (types[index] == "address")
        arg = ADDRESS_PREFIX + arg.substr(2).toLowerCase();
      obj.push(arg);
      return obj;
    }, []);
  },
};
