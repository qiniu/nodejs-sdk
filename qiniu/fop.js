const util = require('./util');
const rpc = require('./rpc');
const conf = require('./conf');
const querystring = require('querystring');

exports.pfop = pfop;
exports.prefop = prefop;

// 发送持久化数据处理请求
// @param bucket - 空间名称
// @param key  - 文件名称
// @param fops - 处理指令集合
// @param pipeline - 处理队列名称
// @param options - 可选参数
//                  notifyURL 回调业务服务器，通知处理结果
//                  force     结果是否强制覆盖已有的同名文件
// @param callbackFunc(err, respBody, respInfo) - 回调函数
function pfop(bucket, key, fops, pipeline, options, callbackFunc) {
  options = options || {};

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

  var requestURI = conf.API_HOST + '/pfop/';
  var reqBody = querystring.stringify(reqParams);
  var auth = util.generateAccessToken(requestURI, reqBody);
  rpc.postWithForm(requestURI, reqBody, auth, callbackFunc);
}

// 查询持久化数据处理进度
// @param persistentId
// @callbackFunc(err, respBody, respInfo) - 回调函数
function prefop(persistentId, callbackFunc) {
  var requestURI = conf.API_HOST + "/status/get/prefop";
  var reqParams = {
    id: persistentId
  };
  var reqBody = querystring.stringify(reqParams);
  var auth = util.generateAccessToken(requestURI, reqBody);
  rpc.postWithForm(requestURI, reqBody, auth, callbackFunc);
}
