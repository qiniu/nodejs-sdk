var crypto = require('crypto');
var http = require('http');
var https = require('https');
var uri = require('url');
var querystring = require('querystring');
var path = require('path');
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

Client.prototype.auth = function(opt, params) {
	opt.headers['Authorization'] = 'QBox ' + conf.ACCESS_KEY + ':' + checksum(opt, params);
};

Client.prototype.execute = function(url, params, onresp, onerror) {

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

	this.auth(opt, body);

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

Client.prototype.callWith = function(url, params, onret) {

	var onresp = function(res) {
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

	return this.execute(url, params, onresp, onerror);
};

exports.Client = Client;

// ------------------------------------------------------------------------------------------

