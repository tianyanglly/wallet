/* eslint valid-jsdoc: "off" */

"use strict";

const path = require("path");
/**
 * @param {Egg.EggAppInfo} appInfo app info
 */
module.exports = (appInfo) => {
  /**
   * built-in config
   * @type {Egg.EggAppConfig}
   **/
  const config = (exports = {});

  // use for cookie sign key, should change to your own and keep security
  config.keys = appInfo.name + "_1655725720433_9430";

  // add your middleware config here
  config.middleware = ["errorHandler", "auth"];

  // 允许跨域的方法
  config.cors = {
    origin: "*",
    allowMethods: "GET, PUT, POST, DELETE, PATCH",
  };

  config.cluster = {
    listen: {
      port: 7019,
    },
  };

  config.logrotator = {
    filesRotateBySize: [
      path.join(appInfo.baseDir, "logs", appInfo.name, "egg-web.log"),
    ],
    maxFileSize: 1024 * 1024 * 1024,
  };

  // add your user config here
  const userConfig = {
    // myAppName: 'egg',
  };

  config.jwt = {
    secret: "XFUkvVDi45cd2nHLj019YabEq3ruMJzt",
  };

  return {
    ...config,
    ...userConfig,
  };
};
