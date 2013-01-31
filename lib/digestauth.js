var crypto = require('crypto');
var http = require('http');
var https = require('https');
var uri = require('url');
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

    var body;
    var isStream = false;
    var isText = true;
    var contentLength = 0;
    var contentType = 'application/x-www-form-urlencoded';
    if (params) {
        if (params instanceof util.Binary) {
            contentType = 'application/octet-stream';
            contentLength = params.bytes;
            isStream = true;
        } else if (params instanceof util.Form) {
            contentType = params.contentType;
            contentLength = null;
            isStream = true;
        } else {
            if (typeof params === 'string') {
                body = params;
            } else {
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
    req.on('error', onerror);

    if (params) {
        if (isStream) {
            params.stream.pipe(req);
        } else {
            req.end(params);
        }
    } else {
        req.end();
    }
    return req;
};

Client.prototype._callWith = function(options, url, params, onret) {

    var onresp = function(res) {
      util.readAll(res, function(data) {
        var ret, err;

        if (data.length === 0) {
          if (res.statusCode !== 200) {
            err = new Error("E" + res.statusCode);
            onret(err);
            return;
          }
          ret = {
            err: null,
            data: {
              code: res.statusCode,
            }
          };
          onret(ret.err, ret.data);
          return;
        }
        try {
          ret = JSON.parse(data);
          if (res.statusCode !== 200) {
            err = new Error("E" + res.statusCode + " : " + ret.error.toString());
            onret(err);
            return;
          }
          ret = {
            err: null,
            data: {
              code: res.statusCode,
              detail: ret
            }
          };
          onret(ret.err, ret.data);
        } catch (e) {
          err = new Error("E" + res.statusCode + "; Error Message: " + e.toString());
          onret(err);
        }
      });
    };

    var onerror = function(e) {
      onret(e);
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

