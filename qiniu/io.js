var conf = require('./conf');
var util = require('./util');
var rpc = require('./rpc');
var fs = require('fs');
var getCrc32 = require('crc32');
var url = require('url');
var mime = require('mime');
var Readable = require('stream').Readable;
var formstream = require('formstream');
var urllib = require('urllib');
var zone = require('./zone');

exports.UNDEFINED_KEY = '?'
exports.PutExtra = PutExtra;
exports.PutRet = PutRet;
exports.put = put;
exports.putWithoutKey = putWithoutKey;
exports.putFile = putFile;
exports.putReadable = putReadable;
exports.putFileWithoutKey = putFileWithoutKey;

// @gist PutExtra
function PutExtra(params, mimeType, crc32, checkCrc) {
  this.params = params || {};
  this.mimeType = mimeType || null;
  this.crc32 = crc32 || null;
  this.checkCrc = checkCrc || 0;
}
// @endgist

function PutRet(hash, key) {
  this.hash = hash || null;
  this.key = key || null;
}

// onret: callback function instead of ret
function putReadable (uptoken, key, rs, extra, onret) {
  if (!extra) {
    extra = new PutExtra();
  }
  if (!extra.mimeType) {
    extra.mimeType = 'application/octet-stream';
  }

  if (!key) {
    key = exports.UNDEFINED_KEY;
  }

  rs.on("error", function (err) {
      onret({code: -1, error: err.toString()}, {});
  });

  var form = getMultipart(uptoken, key, rs, extra);
  // 设置上传域名
  zone.up_host(uptoken, conf);

  return rpc.postMultipart(conf.UP_HOST, form, onret);
}


function put(uptoken, key, body, extra, onret) {
  var rs = new Readable();
  rs.push(body);
  rs.push(null);

  if (!extra) {
    extra = new PutExtra();
  }
  if (extra.checkCrc == 1) {
    var bodyCrc32 = getCrc32(body);
    extra.crc32 = '' + parseInt(bodyCrc32, 16);
  } else if (extra.checkCrc == 2 && extra.crc32) {
    extra.crc32 = '' + extra.crc32
  }
  return putReadable(uptoken, key, rs, extra, onret)
}

function putWithoutKey(uptoken, body, extra, onret) {
  return put(uptoken, null, body, extra, onret);
}

function getMultipart(uptoken, key, rs, extra) {

  var form = formstream();

  form.field('token', uptoken);
  if (key != exports.UNDEFINED_KEY) {
    form.field('key', key);
  }
  form.stream('file', rs, key, extra.mimeType);

  if (extra.crc32) {
    form.field('crc32', extra.crc32);
  }

  for (var k in extra.params) {
    form.field(k, extra.params[k]);
  }

  return form;
}

function putFile(uptoken, key, loadFile, extra, onret) {

  var rs = fs.createReadStream(loadFile);

  if (!extra) {
    extra = new PutExtra();
  }
  if (extra.checkCrc == 1) {
    var fileCrc32 = getCrc32(fs.readFileSync(loadFile));
    extra.crc32 = '' + parseInt(fileCrc32, 16);
  } else if (extra.checkCrc == 2 && extra.crc32) {
    extra.crc32 = '' + extra.crc32
  }
  if (!extra.mimeType) {
    extra.mimeType = mime.lookup(loadFile);
  }

  return putReadable(uptoken, key, rs, extra, onret);
}

function putFileWithoutKey(uptoken, loadFile, extra, onret) {
  return putFile(uptoken, null, loadFile, extra, onret);
}
