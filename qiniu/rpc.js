var urllib = require('urllib');
var conf = require('./conf');
const digest = require('./auth/digest');
const util = require('./util');

exports.get = get;
exports.post = post;
exports.put = put;
exports.getWithOptions = getWithOptions;
exports.getWithToken = getWithToken;
exports.postWithOptions = postWithOptions;
exports.postMultipart = postMultipart;
exports.postWithForm = postWithForm;
exports.postWithoutForm = postWithoutForm;

function addAuthHeaders (headers, mac) {
    const xQiniuDate = util.formatDateUTC(new Date(), 'YYYYMMDDTHHmmssZ');
    if (mac.options.disableQiniuTimestampSignature !== null) {
        if (!mac.options.disableQiniuTimestampSignature) {
            headers['X-Qiniu-Date'] = xQiniuDate;
        }
    } else if (process.env.DISABLE_QINIU_TIMESTAMP_SIGNATURE) {
        if (process.env.DISABLE_QINIU_TIMESTAMP_SIGNATURE.toLowerCase() !== 'true') {
            headers['X-Qiniu-Date'] = xQiniuDate;
        }
    } else {
        headers['X-Qiniu-Date'] = xQiniuDate;
    }
    return headers;
}

function getWithOptions (requestURI, options, callbackFunc) {
    let headers = options.headers || {};
    const mac = options.mac || new digest.Mac();

    if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    headers = addAuthHeaders(headers, mac);

    // if there are V3, V4 token generator in the future, extends options with signVersion
    const token = util.generateAccessTokenV2(
        mac,
        requestURI,
        'GET',
        headers['Content-Type'],
        null,
        headers
    );

    if (mac.accessKey) {
        headers.Authorization = token;
    }

    return get(requestURI, headers, callbackFunc);
}

function getWithToken (requestUrl, token, callbackFunc) {
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (token) {
        headers.Authorization = token;
    }
    return get(requestUrl, headers, callbackFunc);
}

function postWithOptions (requestURI, requestForm, options, callbackFunc) {
    let headers = options.headers || {};
    const mac = options.mac || new digest.Mac();

    if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    headers = addAuthHeaders(headers, mac);

    // if there are V3, V4 token generator in the future, extends options with signVersion
    const token = util.generateAccessTokenV2(
        mac,
        requestURI,
        'POST',
        headers['Content-Type'],
        requestForm,
        headers
    );

    if (mac.accessKey) {
        headers.Authorization = token;
    }

    return post(requestURI, requestForm, headers, callbackFunc);
}

function postMultipart(requestURI, requestForm, callbackFunc) {
    return post(requestURI, requestForm, requestForm.headers(), callbackFunc);
}

function postWithForm(requestURI, requestForm, token, callbackFunc) {
    var headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (token) {
        headers.Authorization = token;
    }
    return post(requestURI, requestForm, headers, callbackFunc);
}

function postWithoutForm(requestURI, token, callbackFunc) {
    var headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (token) {
        headers.Authorization = token;
    }
    return post(requestURI, null, headers, callbackFunc);
}

function get (requestUrl, headers, callbackFunc) {
    headers = headers || {};
    headers['User-Agent'] = headers['User-Agent'] || conf.USER_AGENT;
    headers.Connection = 'keep-alive';

    const data = {
        method: 'GET',
        headers: headers,
        dataType: 'json',
        timeout: conf.RPC_TIMEOUT,
        gzip: true
    };

    if (conf.RPC_HTTP_AGENT) {
        data.agent = conf.RPC_HTTP_AGENT;
    }

    if (conf.RPC_HTTPS_AGENT) {
        data.httpsAgent = conf.RPC_HTTPS_AGENT;
    }

    return urllib.request(
        requestUrl,
        data,
        callbackFunc
    );
}

function post(requestURI, requestForm, headers, callbackFunc) {
    // var start = parseInt(Date.now() / 1000);
    headers = headers || {};
    headers['User-Agent'] = headers['User-Agent'] || conf.USER_AGENT;
    headers.Connection = 'keep-alive';

    var data = {
        headers: headers,
        method: 'POST',
        dataType: 'json',
        timeout: conf.RPC_TIMEOUT,
        gzip: true
        //  timing: true,
    };

    if (conf.RPC_HTTP_AGENT) {
        data.agent = conf.RPC_HTTP_AGENT;
    }

    if (conf.RPC_HTTPS_AGENT) {
        data.httpsAgent = conf.RPC_HTTPS_AGENT;
    }

    if (Buffer.isBuffer(requestForm) || typeof requestForm === 'string') {
        data.content = requestForm;
    } else if (requestForm) {
        data.stream = requestForm;
    } else {
        data.headers['Content-Length'] = 0;
    }

    var req = urllib.request(requestURI, data, function (respErr, respBody,
                                                         respInfo) {
        callbackFunc(respErr, respBody, respInfo);
    });

    return req;
}

function put(requestURL, requestForm, headers, callbackFunc) {
    // var start = parseInt(Date.now() / 1000);
    headers = headers || {};
    headers['User-Agent'] = headers['User-Agent'] || conf.USER_AGENT;
    headers.Connection = 'keep-alive';

    var data = {
        headers: headers,
        method: 'PUT',
        dataType: 'json',
        timeout: conf.RPC_TIMEOUT,
        gzip: true
        //  timing: true,
    };

    if (conf.RPC_HTTP_AGENT) {
        data.agent = conf.RPC_HTTP_AGENT;
    }

    if (conf.RPC_HTTPS_AGENT) {
        data.httpsAgent = conf.RPC_HTTPS_AGENT;
    }

    if (Buffer.isBuffer(requestForm) || typeof requestForm === 'string') {
        data.content = requestForm;
    } else if (requestForm) {
        data.stream = requestForm;
    } else {
        data.headers['Content-Length'] = 0;
    }

    var req = urllib.request(requestURL, data, function (err, ret, info) {
        callbackFunc(err, ret, info);
    });

    return req;
}
