var urllib = require('urllib');
var util = require('./util');
var conf = require('./conf');

exports.post = post;
exports.postMultipart = postMultipart;
exports.postWithForm = postWithForm;
exports.postWithoutForm = postWithoutForm;

function postMultipart(requestURI, requestForm, callbackFunc) {
  return post(requestURI, requestForm, requestForm.headers(), callbackFunc);
}

function postWithForm(requestURI, requestForm, token, callbackFunc) {
  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  if (token) {
    headers['Authorization'] = token;
  }
  return post(requestURI, requestForm, headers, callbackFunc);
}

function postWithoutForm(requestURI, token, callbackFunc) {
  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (token) {
    headers['Authorization'] = token;
  }
  return post(requestURI, null, headers, callbackFunc);
}

function post(requestURI, requestForm, headers, callbackFunc) {
  headers = headers || {};
  headers['User-Agent'] = headers['User-Agent'] || conf.USER_AGENT;
  headers['Accept-Encoding'] = 'gzip';
  headers['Connection'] = 'keep-alive';

  var data = {
    headers: headers,
    method: 'POST',
    dataType: 'json',
    timeout: conf.RPC_TIMEOUT,
  };

  if (Buffer.isBuffer(requestForm) || typeof requestForm === 'string') {
    headers['Content-Type'] = 'application/octet-stream';
    data.content = requestForm;
  } else if (requestForm) {
    data.stream = requestForm;
  } else {
    data.headers['Content-Length'] = 0;
  };

  var req = urllib.request(requestURI, data, function(respErr, respBody,
    respInfo) {
    callbackFunc(respErr, respBody, respInfo);
  });

  return req;
}
