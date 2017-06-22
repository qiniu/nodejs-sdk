const rpc = require('./rpc');
const conf = require('./conf');
const util = require('./util');
const querystring = require('querystring');

exports.listPrefix = listPrefix;

// 获取指定前缀的文件列表
// @link https://developer.qiniu.com/kodo/api/1284/list
//
// @param bucket 空间名称
// @param options 列举操作的可选参数
//                prefix    列举的文件前缀
//                marker    上一次列举返回的位置标记，作为本次列举的起点信息
//                limit     每次返回的最大列举文件数量
//                delimiter 指定目录分隔符
// @param callbackFunc(err, respBody, respInfo) - 回调函数
function listPrefix(bucket, options, callbackFunc) {
  options = options || {};

  //必须参数
  var reqParams = {
    bucket: bucket,
  };

  if (options.prefix) {
    reqParams.prefix = options.prefix;
  } else {
    reqParams.prefix = "";
  }

  if (options.limit >= 1 && options <= 1000) {
    reqParams.limit = options.limit;
  } else {
    reqParams.limit = 1000;
  }

  if (options.marker) {
    reqParams.marker = options.marker;
  } else {
    reqParams.marker = "";
  }

  if (options.delimiter) {
    reqParams.delimiter = options.delimiter;
  } else {
    reqParams.delimiter = "";
  }
  var reqSpec = querystring.stringify(reqParams);
  var requestURI = conf.RSF_HOST + '/list?' + reqSpec;

  var auth = util.generateAccessToken(requestURI, null);
  rpc.postWithForm(requestURI, null, auth, callbackFunc);
}
