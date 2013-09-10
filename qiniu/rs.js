
var url = require('url');
var crypto = require('crypto');
var formstream = require('formstream');
var querystring = require('querystring');
var rpc = require('./rpc');
var conf = require('./conf');
var util = require('./util');
var Mac = require('./auth/digest').Mac;


exports.Client = Client;
exports.Entry = Entry;
exports.EntryPath = EntryPath;
exports.EntryPathPair = EntryPathPair;
exports.BatchItemRet = BatchItemRet;
exports.BatchStatItemRet = BatchStatItemRet;

exports.PutPolicy = PutPolicy;
exports.GetPolicy = GetPolicy;
exports.makeBaseUrl = makeBaseUrl;

function Client(client) {
  this.client = client || null;
}

Client.prototype.stat = function(bucket, key, onret) {
  var encodedEntryUri = getEncodedEntryUri(bucket, key);
  var uri = conf.RS_HOST + '/stat/' + encodedEntryUri;
  var digest = util.generateAccessToken(uri, null);

  rpc.postWithoutForm(uri, digest, onret);
}

Client.prototype.remove = function(bucket, key, onret) {
  /*
   * func (this Client) Delete(bucket, key string) (err error)
   * */
  var encodedEntryUri = getEncodedEntryUri(bucket, key);
  var uri = conf.RS_HOST + '/delete/' + encodedEntryUri;
  var digest = util.generateAccessToken(uri, null);
  rpc.postWithoutForm(uri, digest, onret);
}

Client.prototype.move = function(bucketSrc, keySrc, bucketDest, keyDest, onret) {
  var encodedEntryURISrc = getEncodedEntryUri(bucketSrc, keySrc);
  var encodedEntryURIDest = getEncodedEntryUri(bucketDest, keyDest);
  var uri = conf.RS_HOST + '/move/' + encodedEntryURISrc + '/' + encodedEntryURIDest;
  var digest = util.generateAccessToken(uri, null);
  rpc.postWithoutForm(uri, digest, onret);
}

Client.prototype.copy = function(bucketSrc, keySrc, bucketDest, keyDest, onret) {
  var encodedEntryURISrc = getEncodedEntryUri(bucketSrc, keySrc);
  var encodedEntryURIDest = getEncodedEntryUri(bucketDest, keyDest);
  var uri = conf.RS_HOST + '/copy/' + encodedEntryURISrc + '/' + encodedEntryURIDest;
  var digest = util.generateAccessToken(uri, null);
  rpc.postWithoutForm(uri, digest, onret);
}


function Entry(hash, fsize, putTime, mimeType, endUser) {
  this.hash = hash || null;
  this.fsize = fsize || null;
  this.putTime = putTime || null;
  this.mimeType = mimeType || null;
  this.endUser = endUser || null;
}

// ----- batch  -------

function EntryPath(bucket, key) {
  this.bucket = bucket || null;
  this.key = key || null;
}

EntryPath.prototype.encode = function() {
  return getEncodedEntryUri(this.bucket, this.key);
}

EntryPath.prototype.toStr = function(op) {
  return 'op=/' + op + '/' + getEncodedEntryUri(this.bucket, this.key) + '&';
}

function EntryPathPair(src, dest) {
  this.src = src || null;
  this.dest = dest || null;
}

EntryPathPair.prototype.toStr = function(op) {
  return 'op=/' + op + '/' + this.src.encode() + '/' + this.dest.encode() + '&';
}

function BatchItemRet(error, code) {
  this.error = error || null;
  this.code = code || null;
}

function BatchStatItemRet(data, error, code) {
  this.data = data;
  this.error = error;
  this.code = code;
}

Client.prototype.batchStat = function(entries, onret) {
  fileHandle('stat', entries, onret);
}

Client.prototype.batchDelete = function(entries, onret) {
  fileHandle('delete', entries, onret);
}

Client.prototype.batchMove = function(entries, onret) {
  fileHandle('move', entries, onret);
}

Client.prototype.batchCopy = function(entries, onret) {
  fileHandle('copy', entries, onret);
}

function fileHandle(op, entries, onret) {
  var body = '';
  for (var i in entries) {
    body += entries[i].toStr(op);
  }

  var uri = conf.RS_HOST + '/batch';
  var digest = util.generateAccessToken(uri, body);
  rpc.postWithForm(uri, body, digest, onret);
}

function getEncodedEntryUri(bucket, key) {
  return util.urlsafeBase64Encode(bucket + ':' + key);
}

// ----- token --------
// @gist PutPolicy
function PutPolicy(scope, callbackUrl, callbackBody, returnUrl, returnBody,
                  asyncOps, endUser, expires) {
  this.scope = scope || null;
  this.callbackUrl = callbackUrl || null;
  this.callbackBody = callbackBody || null;
  this.returnUrl = returnUrl || null;
  this.returnBody = returnBody || null;
  this.asyncOps = asyncOps || null;
  this.endUser = endUser || null;
  this.expires = expires || 3600;
}
// @endgist

PutPolicy.prototype.token = function(mac) {
  if (mac == null) {
    mac = new Mac(conf.ACCESS_KEY, conf.SECRET_KEY);
  }
  var flags = this.getFlags();
  var encodedFlags = util.urlsafeBase64Encode(JSON.stringify(flags));
  var encoded = util.hmacSha1(encodedFlags, mac.secretKey);
  var encodedSign = util.base64ToUrlSafe(encoded);
  var uploadToken = mac.accessKey + ':' + encodedSign + ':' + encodedFlags;
  return uploadToken;
}

PutPolicy.prototype.getFlags = function(putPolicy) {
  var flags = {};
  if (this.scope != null) {
    flags['scope'] = this.scope;
  }
  if (this.callbackUrl != null) {
    flags['callbackUrl'] = this.callbackUrl;
  }
  if (this.callbackBody != null) {
    flags['callbackBody'] = this.callbackBody;
  }
  if (this.returnUrl != null) {
    flags['returnUrl'] = this.returnUrl;
  }
  if (this.returnBody != null) {
    flags['returnBody'] = this.returnBody;
  }
  if (this.asyncOps != null) {
    flags['asyncOps'] = this.asyncOps;
  }
  if (this.endUser != null) {
    flags['endUser'] = this.endUser;
  }
  flags['deadline'] = this.expires + Math.floor(Date.now() / 1000);
  return flags;
}


function GetPolicy(expires) {
  this.expires = expires || 3600;
}

GetPolicy.prototype.makeRequest = function(baseUrl, mac) {
  if (!mac) {
    mac = new Mac(conf.ACCESS_KEY, conf.SECRET_KEY);
  }

  var deadline = this.expires + Math.floor(Date.now() / 1000);

  if (baseUrl.indexOf('?') >= 0) {
    baseUrl += '&e=';
  } else {
    baseUrl += '?e=';
  }
  baseUrl += deadline;

  var signature = util.hmacSha1(baseUrl, mac.secretKey);
  var encodedSign = util.base64ToUrlSafe(signature);
  var downloadToken = mac.accessKey + ':' + encodedSign;

  return baseUrl + '&token=' + downloadToken;
}

function makeBaseUrl(domain, key) {
  key = new Buffer(key);
  return 'http://' + domain + '/' + querystring.escape(key);
}
