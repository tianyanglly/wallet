"use strict";

/**
 * @param {Egg.Application} app - egg application
 */
module.exports = (app) => {
  const { router, controller } = app;
  //创建钱包
  router.get("/create_wallet", controller.ether.create);
  //验证签名
  router.get("/recover", controller.ether.recover);
  router.get("/price", controller.ether.tokenPrice);
  router.get("/transfer", controller.ether.transfer);
};
