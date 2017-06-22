var urllib = require('urllib');
var util = require('./util');
var conf = require('./conf');

exports.postMultipart = postMultipart;
exports.postWithForm = postWithForm;
exports.postWithoutForm = postWithoutForm;

function postMultipart(uri, form, onret) {
  return post(uri, form, form.headers(), onret);
}

function postWithForm(uri, form, token, callbackFunc) {
  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  if (token) {
    headers['Authorization'] = token;
  }
  return post(uri, form, headers, callbackFunc);
}

function postWithoutForm(uri, token, onret) {
  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (token) {
    headers['Authorization'] = token;
  }
  return post(uri, null, headers, onret);
}

function post(uri, form, headers, callbackFunc) {
  headers = headers || {};
  headers['User-Agent'] = headers['User-Agent'] || conf.USER_AGENT;

  var data = {
    headers: headers,
    method: 'POST',
    dataType: 'json',
    timeout: conf.RPC_TIMEOUT,
  };

  if (Buffer.isBuffer(form) || typeof form === 'string') {
    data.content = form;
  } else if (form) {
    data.stream = form;
  } else {
    data.headers['Content-Length'] = 0;
  };

  var req = urllib.request(uri, data, function(err, respBody, respInfo) {
    var respErr = null;
    if (err || Math.floor(respInfo.statusCode / 100) !== 2) {
      respErr = {
        code: respInfo && respInfo.statusCode || -1,
        error: err || respBody && respBody.error || ''
      };
    }
    callbackFunc(respErr, respBody, respInfo);
  });

  return req;
}
