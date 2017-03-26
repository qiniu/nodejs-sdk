var fs = require('fs');
var url = require('url');
var path = require('path');
var crypto = require('crypto');
var conf = require('./conf');


exports.isQiniuCallback = isQiniuCallback;

// ------------------------------------------------------------------------------------------
// func encode

exports.urlsafeBase64Encode = function(jsonFlags) {
  var encoded = new Buffer(jsonFlags).toString('base64');
  return exports.base64ToUrlSafe(encoded);
}

exports.base64ToUrlSafe = function(v) {
  return v.replace(/\//g, '_').replace(/\+/g, '-');
}

exports.hmacSha1 = function(encodedFlags, secretKey) {
  /*
   *return value already encoded with base64
  * */
  var hmac = crypto.createHmac('sha1', secretKey);
  hmac.update(encodedFlags);
  return hmac.digest('base64');
}

// ------------------------------------------------------------------------------------------
// func generateAccessToken

exports.generateAccessToken = function(uri, body) {
  var u = url.parse(uri);
  var path = u.path;
  var access = path + '\n';

  if (body) {
    access += body;
  }

  var digest = exports.hmacSha1(access, conf.SECRET_KEY);
  var safeDigest = exports.base64ToUrlSafe(digest);
  return 'QBox ' + conf.ACCESS_KEY + ':' + safeDigest;
}

exports.getAntiLeechAccessUrlBasedOnTimestamp = function (host, protocol, pathname, query, encryptKey, durationInseconds) {
    var pathname = encodeURI(pathname, 'UTF-8');
    var time = (parseInt(Date.now() /1000) + durationInseconds).toString(16);
    var sign = encryptKey + pathname + time;

    var signstr = crypto.createHash('md5').update(sign).digest('hex');
    
    if(query != undefined) {
      return protocol + '//' + host  + pathname + '?' + query + '&sign=' + signstr + "&t=" + time;
    } else {
      return 'http://' + host  + pathname + '?sign=' + signstr + "&t=" + time;
    }
}

exports.getTimestampWithUrl = function (URL, encryptKey, durationInseconds ) {
    var urlObj = url.parse(URL);
    var host = urlObj.host;
    var protocol = urlObj.protocol;
    console.log(protocol);
    var pathname = urlObj.pathname;
    console.log(pathname);
    var query = urlObj.query;
    console.log(query);
    return exports.getAntiLeechAccessUrlBasedOnTimestamp(host, protocol, pathname, query, encryptKey, durationInseconds);
}


function isQiniuCallback(path, body, callbackAuth) {
  var auth = exports.generateAccessToken(path, body);
  return auth === callbackAuth;
}
