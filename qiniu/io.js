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
function putReadable(uptoken, key, rs, extra, onret) {
  var scheme = conf.AUTOZONE;//上传域名使用的协议，默认使用http,可以在conf.js设置http 或 https
  // 自动获取空间对应的上传域名
  if(conf.AUTOZONE){
    var ak = uptoken.toString().split(":")[0];
    var tokenPolicy = uptoken.toString().split(":")[2];
    var tokenPolicyStr = new Buffer(tokenPolicy, 'base64').toString();
    var josn_tokenPolicyStr = JSON.parse(tokenPolicyStr);
    var backet = josn_tokenPolicyStr.scope;
    // 判断过期时间
    if( new Date().getTime() > conf.DEADLINE){
      urllib.request('http://uc.qbox.me/v1/query', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          'ak':ak,
          'bucket':backet
        }
      },function (err, data, res) {
        var str = data.toString();
        var json_str = JSON.parse(str);

        //判断设置使用的协议
        if(scheme == 'http'){
           conf.UP_HOST = json_str.http.up[1];
        }else{
           conf.UP_HOST = json_str.https.up[0];
        }

      //ttl 获取up_host的缓存时间
      conf.DEADLINE = json_str.ttl + new Date().getTime(); 

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
      return rpc.postMultipart(conf.UP_HOST, form, onret);
    });

    }else{
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
      return rpc.postMultipart(conf.UP_HOST, form, onret);
    }
  }else{
    //指定空间上传域名，在conf.js中设置UP_HOST
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
    return rpc.postMultipart(conf.UP_HOST, form, onret);
  }
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
