var crypto = require('crypto');
var http = require('http');
var https = require('https');
var uri = require('url');
var fs = require('fs');
var querystring = require('querystring');
var conf = require('./conf.js');
var util = require('./util.js');

// ------------------------------------------------------------------------------------------
// func checksum

function checksum(opt, body) {
  var hmac = crypto.createHmac('sha1', conf.SECRET_KEY);
  hmac.update(opt.path + "\n");
  if (body) {
      hmac.update(body);
  }
  var digest = hmac.digest('base64');
  return util.base64ToUrlsafe(digest);
}

// ------------------------------------------------------------------------------------------
// type Client

function Client() {
}

Client.prototype.execute = function(options, url, params, onresp, onerror) {

  var u = uri.parse(url);
  var opt = {
    headers: {'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate'},
    host: u.hostname,
    port: u.port,
    path: u.path,
    method: 'POST'
  };

  var proto;
  if (u.protocol === 'https:') {
    proto = https;
  } else {
    proto = http;
  }

  var body,
      isStream = false,
      contentLength = 0,
      contentType = 'application/x-www-form-urlencoded';

  if (params) {
    if (params instanceof util.Binary) {
      contentType = 'application/octet-stream';
      contentLength = params.bytes;
      isStream = true;
    } else if (params instanceof util.Form) {
      contentType = params.contentType;
      contentLength = null;
      isStream = true;
    } else if (params instanceof util.Txt) {
      contentType = params.contentType;
      body = params.body;
      contentLength = body.length;
    } else {
      if ((typeof params === 'string') || (params instanceof Buffer)) {
        body = params;
      }  else {
        body = querystring.stringify(params);
      }
      contentLength = body.length;
    }
  }

  opt.headers['Content-Type'] = contentType;
  if (contentLength !== null) {
    opt.headers['Content-Length'] = contentLength;
  }

  if (options.UploadSignatureToken != undefined && options.UploadSignatureToken != null && options.UploadSignatureToken != "") {
    opt.headers['Authorization'] = 'UpToken ' + options.UploadSignatureToken;
  } else if (options.AccessToken != undefined && options.AccessToken != null && options.AccessToken != "") {
    opt.headers['Authorization'] = 'Bearer ' + options.AccessToken;
  } else {
    opt.headers['Authorization'] = 'QBox ' + conf.ACCESS_KEY + ':' + checksum(opt, body);
  }

  var req = proto.request(opt, onresp);

  req.on('socket', function(socket){
  });

  if (params) {
    if (isStream) {
      try{
        params.stream.pipe(req);
      } catch (e) {
        req.abort();
      }
    } else {
      if (params instanceof util.Txt) {
        req.end(params.body);
      } else {
        req.end(params);
      }
    }
  } else {
    req.end();
  }
  return req;
};


Client.prototype._callWith = function(options, url, params, onret) {

  var onresp = function(res) {
    res.on('close', function(){
      console.log("On resp close.");
    });

    util.readAll(res, function(data) {
      var ret;
      if (data.length === 0) {
        ret = {code: res.statusCode};
        if (res.statusCode !== 200) {
          ret.error = 'E' + res.statusCode;
        }
        onret(ret);
        return;
      }
      try {
        ret = JSON.parse(data);
        if (res.statusCode === 200) {
          ret = {code: 200, data: ret};
        } else {
          ret.code = res.statusCode;
        }
      } catch (e) {
        ret = {code: -2, error: e.toString(), detail: e};
      }
      onret(ret);
    });
  };

  var onerror = function(e) {
    var ret = {
      code: -1,
      error: e.message,
      detail: e
    };
    onret(ret);
  };

  return this.execute(options, url, params, onresp, onerror);
};

Client.prototype.callWith = function(url, params, onret) {
  return this._callWith("", url, params, onret);
}

Client.prototype.callWithToken = function(uploadToken, url, params, onret){
  var options = { 'UploadSignatureToken': uploadToken };
  return this._callWith(options, url, params, onret);
};

exports.Client = Client;

// ------------------------------------------------------------------------------------------
