var crypto = require('crypto');
var config = require("./conf.js");
var util = require('./util.js');

function UploadToken(scope, expires, callbackUrl, callbackBodyType, customer) {
  this.scope = scope || null;
  this.expires = expires || 3600;
  this.callbackUrl = callbackUrl || null;
  this.callbackBodyType = callbackBodyType || null;
  this.customer = customer || null;
}
 UploadToken.prototype.generateSignature = function() {
  var params = {
    "scope": this.scope,
    "deadline": this.expires + Math.floor(Date.now() / 1000),
    "callbackUrl": this.callbackUrl,
    "callbackBodyType": this.callbackBodyType,
    "customer": this.customer,
  };
  var paramsString = JSON.stringify(params)
  return util.encode(paramsString);
};

UploadToken.prototype.generateEncodedDigest = function(signature) {
  var hmac = crypto.createHmac('sha1', config.SECRET_KEY);
  hmac.update(signature);
	var digest = hmac.digest('base64');
	return util.base64ToUrlsafe(digest);
};

UploadToken.prototype.generateToken = function() {
  var signature = this.generateSignature();
  var encoded_digest = this.generateEncodedDigest(signature);
  return config.ACCESS_KEY + ":" + encoded_digest + ":" + signature;
};

exports.UploadToken = UploadToken;
