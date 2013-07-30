var url = require('url');
var util = require('./util');
var conf = require('./conf');

exports.postMultipart = postMultipart;
exports.postWithForm = postWithForm;
exports.postWithoutForm = postWithoutForm;

function postMultipart(uri, form, onret) {
  post(uri, form, form.headers(), util.getResp(onret));
}

function postWithForm(uri, form, token, onret) {
  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  }
  if (token) {
    headers['Authorization'] = token;
  }
  post(uri, form, headers, util.getResp(onret));
}

function postWithoutForm(uri, token, onret) {
  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (token) {
    headers['Authorization'] = token;
  }
  post(uri, null, headers, util.getResp(onret));
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

