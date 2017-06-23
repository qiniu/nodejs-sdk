const util = require('./util');
const rpc = require('./rpc');
const conf = require('./conf');
const digest = require('./auth/digest');
const zone = require('./zone.js');
const querystring = require('querystring');

exports.OperationManager = OperationManager;

function OperationManager(mac, config) {
  this.mac = mac || new digest.Mac();
  this.config = config || new conf.Config();
}

// 发送持久化数据处理请求
// @param bucket - 空间名称
// @param key  - 文件名称
// @param fops - 处理指令集合
// @param pipeline - 处理队列名称
// @param options - 可选参数
//                  notifyURL 回调业务服务器，通知处理结果
//                  force     结果是否强制覆盖已有的同名文件
// @param callbackFunc(err, respBody, respInfo) - 回调函数
OperationManager.prototype.pfop = function(bucket, key, fops, pipeline,
  options, callbackFunc) {
  options = options || {};
  var that = this;
  //必须参数
  var reqParams = {
    bucket: bucket,
    key: key,
    pipeline: pipeline,
    fops: fops.join(";"),
  };

  //notifyURL
  if (options.notifyURL) {
    reqParams.notifyURL = options.notifyURL;
  }

  //force
  if (options.force) {
    reqParams.force = 1;
  }

  var useCache = false;
  if (this.config.zone) {
    if (this.config.zoneExpire == -1) {
      useCache = true;
    } else {
      if (!util.isTimestampExpired(this.config.zoneExpire)) {
        useCache = true;
      }
    }
  }

  if (useCache) {
    pfopReq(this.mac, this.config, reqParams, callbackFunc);
  } else {
    zone.getZoneInfo(this.mac.accessKey, bucket, function(err, cZoneInfo,
      cZoneExpire) {
      if (err) {
        callbackFunc(err, null, null);
        return;
      }

      //update object
      that.config.zone = cZoneInfo;
      that.config.zoneExpire = cZoneExpire;
      //pfopReq
      pfopReq(that.mac, that.config, reqParams, callbackFunc);
    });
  }
}

function pfopReq(mac, config, reqParams, callbackFunc) {
  var scheme = config.useHttpsDomain ? "https://" : "http://";
  var requestURI = scheme + config.zone.apiHost + '/pfop/';
  var reqBody = querystring.stringify(reqParams);
  var auth = util.generateAccessToken(mac, requestURI, reqBody);
  rpc.postWithForm(requestURI, reqBody, auth, callbackFunc);
}

// 查询持久化数据处理进度
// @param persistentId
// @callbackFunc(err, respBody, respInfo) - 回调函数
OperationManager.prototype.prefop = function(persistentId, callbackFunc) {
  var apiHost = "http://api.qiniu.com";
  var zoneIndex = persistentId.indexOf(".");
  if (zoneIndex == -1) {
    callbackFunc("invalid persistentId", null, null);
    return;
  }
  var zoneTag = persistentId.substring(0, zoneIndex);
  switch (zoneTag) {
    case "z1":
      apiHost = "api-z1.qiniu.com";
      break;
    case "z2":
      apiHost = "api-z2.qiniu.com";
      break;
    case "na0":
      apiHost = "api-na0.qiniu.com";
      break;
    default:
      apiHost = "api.qiniu.com";
      break;
  }

  var scheme = this.config.useHttpsDomain ? "https://" : "http://";
  var requestURI = scheme + apiHost + "/status/get/prefop";
  var reqParams = {
    id: persistentId
  };
  var reqBody = querystring.stringify(reqParams);
  rpc.postWithForm(requestURI, reqBody, null, callbackFunc);
}
