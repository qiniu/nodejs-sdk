var crypto = require('crypto');
var config = require("./conf.js");
var util = require('./util.js');

exports.PutPolicy = PutPolicy;
exports.GetPolicy = GetPolicy;

// ------------------------------------------------------------------------------------------
// func generateSignature

function generateSignature(params) {
  var paramsString = JSON.stringify(params);
  return util.encode(paramsString);
}

// ------------------------------------------------------------------------------------------
// func generateEncodedDigest

function generateEncodedDigest(signature) {
  var hmac = crypto.createHmac('sha1', config.SECRET_KEY);
  hmac.update(signature);
  var digest = hmac.digest('base64');
  return util.base64ToUrlsafe(digest);
}

// ------------------------------------------------------------------------------------------
// func generateToken

function generateToken(params) {
  var signature = generateSignature(params);
  var encodedDigest = generateEncodedDigest(signature);
  return config.ACCESS_KEY + ":" + encodedDigest + ":" + signature;
}

// ------------------------------------------------------------------------------------------
// type PutPolicy

function PutPolicy(opts) {
  this.scope = opts.scope || null;
  this.expires = opts.expires || 3600;
  this.callbackUrl = opts.callbackUrl || null;
  this.callbackBodyType = opts.callbackBodyType || null;
  this.customer = opts.customer || null;
  this.escape = opts.escape || 0;
  this.asyncOps = opts.asyncOps || null;
}

PutPolicy.prototype.token = function() {
  var params = {
    "deadline": this.expires + Math.floor(Date.now() / 1000),
    "escape": this.excape,
  };
  if (this.scope !== null) {
    params["scope"] = this.scope;
  }
  if (this.callbackUrl !== null) {
    params["callbackurl"] = this.callbackUrl;
  }
  if (this.callbackBodyType !== null) {
    params["callbackBodyType"] = this.callbackBodyType;
  }
  if (this.customer !== null) {
    params["customer"] = this.customer;
  }
  if (this.asyncOps !== null) {
    params["asyncOps"] = this.asyncOps;
  }
  return generateToken(params);
};

// ------------------------------------------------------------------------------------------
// type GetPolicy

function GetPolicy(opts) {
  this.expires = opts.expires || 3600;
  this.scope = opts.scope || "*/*";
}

GetPolicy.prototype.token = function() {
  var params = {
    S: this.scope,
    E: this.expires + Math.floor(Date.now() / 1000),
  };
  return generateToken(params);
};

// ------------------------------------------------------------------------------------------

