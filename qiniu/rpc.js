var url = require('url');
var util = require('./util');
var conf = require('./conf');

exports.postMultipart = postMultipart;
exports.postWithForm = postWithForm;
exports.postWithoutForm = postWithoutForm;

function postMultipart(uri, form, onret) {
  post(uri, form, form.headers(), getResp(onret));
}

function postWithForm(uri, form, token, onret) {
  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  }
  if (token) {
    headers['Authorization'] = token;
  }
  post(uri, form, headers, getResp(onret));
}

function postWithoutForm(uri, token, onret) {
  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (token) {
    headers['Authorization'] = token;
  }
  post(uri, null, headers, getResp(onret));
}

function getResp(onret) {
  var onresp = function(res) {
    util.readAll(res, function(data) {
      var ret = {};
      if (data.length === 0) {
        ret = {code: res.statusCode};
        onret(ret);
        return;
      }
      ret = {code: res.statusCode, data: data.toString()};
      onret(ret);
    });
  };
  return onresp;
}

function post(uri, form, headers, onresp) {

  var u = url.parse(uri);
  var options = {
    headers: headers,
    method: 'POST',
    host: u.hostname,
    port: u.port,
    path: u.path,
    'User-Agent': conf.USER_AGENT,
  }

  var proto;
  if (u.protocol == 'https') {
    proto = require('https');
  } else {
    proto = require('http');
  }

  var req = proto.request(options, onresp);
  if(form) {
    if (typeof form === 'string') {
      req.end(form);
    } else {
      form.pipe(req);
    }
  } else {
    req.end();
  }
}

