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

Client.prototype.auth = function(opt, params) {
	opt.headers['Authorization'] = 'QBox ' + conf.ACCESS_KEY + ':' + checksum(opt, params)
};

Client.prototype.execute = function(url, params, onresp, onerror) {

	var u = uri.parse(url);
	var opt = {
		headers: {},
		host: u.hostname,
		port: u.port,
		path: u.path,
		method: 'POST'
	};

	var proto;
	if (u.protocol == 'https:') {
		proto = https;
	} else {
		proto = http;
	}

	var body;
	var binary;
	if (params) {
		if (params instanceof util.Binary) {
			opt.headers['Content-Type'] = 'application/octet-stream';
			opt.headers['Content-Length'] = params.bytes;
			binary = true;
		} else {
			if (typeof params === 'string') {
				body = params;
			} else {
				body = querystring.stringify(params);
			}
			opt.headers['Content-Type'] = 'application/x-www-form-urlencoded';
			opt.headers['Content-Length'] = params.length;
		}
	}
	this.auth(opt, body);

	var req = proto.request(opt, onresp);
	req.on('error', onerror);

	if (params) {
		if (binary) {
			params.stream.pipe(req);
		} else {
			req.write(params);
		}
	}
	req.end();
};

Client.prototype.callWith = function(url, params, onret) {

	var onresp = function(res) {
		util.readAll(res, function(data) {
			if (data.length === 0) {
				var ret = {code: res.statusCode};
				if (res.statusCode != 200) {
					ret.error = 'E' + res.statusCode;
				}
				onret(ret);
				return;
			}
			var ret;
			try {
				ret = JSON.parse(data);
				if (res.statusCode == 200) {
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
		onret(ret)
	};

	this.execute(url, params, onresp, onerror);
};

exports.Client = Client;

// ------------------------------------------------------------------------------------------

