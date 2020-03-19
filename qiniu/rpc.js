const axios = require('axios');
const conf = require('./conf');

exports.get = get;
exports.post = post;
exports.postMultipart = postMultipart;
exports.postWithForm = postWithForm;
exports.postWithoutForm = postWithoutForm;

function postMultipart (requestURI, requestForm, callbackFunc) {
    return post(requestURI, requestForm, requestForm.getHeaders(), callbackFunc);
}

function postWithForm (requestURI, requestForm, token, callbackFunc) {
    var headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (token) {
        headers.Authorization = token;
    }
    return post(requestURI, requestForm, headers, callbackFunc);
}

function postWithoutForm (requestURI, token, callbackFunc) {
    var headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (token) {
        headers.Authorization = token;
    }
    return post(requestURI, null, headers, callbackFunc);
}

function get (requestURI, callbackFunc) {
    return axios.get(requestURI).then((res) => {
        res.statusCode = res.status;
        callbackFunc(null, res.data, res);
    }).catch((err) => {
        let respBody = null;
        if (err.response) {
            err.response.statusCode = err.response.status;
            respBody = err.response.data;
        }
        callbackFunc(err, respBody, err.response);
    });
}

function post (requestURI, requestForm, headers, callbackFunc) {
    headers = headers || {};
    headers['User-Agent'] = headers['User-Agent'] || conf.USER_AGENT;
    headers.Connection = 'keep-alive';

    const data = {
        url: requestURI,
        headers: headers,
        method: 'POST',
        responseType: 'json',
        timeout: conf.RPC_TIMEOUT,
        decompress: false
    };

    if (conf.RPC_HTTP_AGENT) {
        data.httpAgent = conf.RPC_HTTP_AGENT;
    }

    if (conf.RPC_HTTPS_AGENT) {
        data.httpsAgent = conf.RPC_HTTPS_AGENT;
    }

    if (requestForm) {
        data.data = requestForm;
    } else {
        data.headers['Content-Length'] = 0;
    }
    return axios.request(data).then((res) => {
        res.statusCode = res.status;
        callbackFunc(null, res.data, res);
    }).catch((err) => {
        let respBody = null;
        if (err.response) {
            err.response.statusCode = err.response.status;
            respBody = err.response.data;
        }
        callbackFunc(err, respBody, err.response);
    });
}
