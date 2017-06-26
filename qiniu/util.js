var url = require('url');
var crypto = require('crypto');
var conf = require('./conf');

// Check Timestamp Expired or not
exports.isTimestampExpired = function(timestamp) {
  return timestamp < parseInt(Date.now() / 1000);
}

// Encoded Entry
exports.encodedEntry = function(bucket, key) {
  return exports.urlsafeBase64Encode(bucket + (key ? ':' + key : ''));
}

// Get accessKey from uptoken
exports.getAKFromUptoken = function(uploadToken) {
  var sepIndex = uploadToken.indexOf(":");
  return uploadToken.substring(0, sepIndex);
}

// Get bucket from uptoken
exports.getBucketFromUptoken = function(uploadToken) {
  var sepIndex = uploadToken.lastIndexOf(":");
  var encodedPutPolicy = uploadToken.substring(sepIndex + 1);
  var putPolicy = exports.urlSafeBase64Decode(encodedPutPolicy);
  var putPolicyObj = JSON.parse(putPolicy);
  var scope = putPolicyObj.scope;
  var scopeSepIndex = scope.indexOf(":");
  if (scopeSepIndex == -1) {
    return scope;
  } else {
    return scope.substring(0, scopeSepIndex);
  }
}


exports.base64ToUrlSafe = function(v) {
  return v.replace(/\//g, '_').replace(/\+/g, '-');
}

exports.urlSafeToBase64 = function(v) {
  return v.replace(/\_/g, '/').replace(/\-/g, '+');
}

// UrlSafe Base64 Decode
exports.urlsafeBase64Encode = function(jsonFlags) {
  var encoded = new Buffer(jsonFlags).toString('base64');
  return exports.base64ToUrlSafe(encoded);
}

// UrlSafe Base64 Decode
exports.urlSafeBase64Decode = function(fromStr) {
  return new Buffer(exports.urlSafeToBase64(fromStr), 'base64').toString();
}

// Hmac-sha1 Crypt
exports.hmacSha1 = function(encodedFlags, secretKey) {
  /*
   *return value already encoded with base64
   * */
  var hmac = crypto.createHmac('sha1', secretKey);
  hmac.update(encodedFlags);
  return hmac.digest('base64');
}

// 创建AccessToken凭证
// @param mac         AK&SK对象
// @param requestURI 回调的URL中的requestURI
// @param reqBody    请求Body，仅当请求的ContentType为
//                   application/x-www-form-urlencoded时才需要传入该参数
exports.generateAccessToken = function(mac, requestURI, reqBody) {
  var u = url.parse(requestURI);
  var path = u.path;
  var access = path + '\n';

  if (reqBody) {
    access += reqBody;
  }

  var digest = exports.hmacSha1(access, mac.secretKey);
  var safeDigest = exports.base64ToUrlSafe(digest);
  return 'QBox ' + mac.accessKey + ':' + safeDigest;
}

// 校验七牛上传回调的Authorization
// @param mac           AK&SK对象
// @param requestURI   回调的URL中的requestURI
// @param reqBody      请求Body，仅当请求的ContentType为
//                     application/x-www-form-urlencoded时才需要传入该参数
// @param callbackAuth 回调时请求的Authorization头部值
exports.isQiniuCallback = function(mac, requestURI, reqBody, callbackAuth) {
  var auth = exports.generateAccessToken(mac, requestURI, reqBody);
  return auth === callbackAuth;
}
