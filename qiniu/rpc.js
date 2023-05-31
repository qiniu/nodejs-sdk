const pkg = require('../package.json');
const conf = require('./conf');
const digest = require('./auth/digest');
const util = require('./util');
const client = require('./httpc/client');
const middleware = require('./httpc/middleware');

let uaMiddleware = new middleware.UserAgentMiddleware(pkg.version);
uaMiddleware = Object.defineProperty(uaMiddleware, 'userAgent', {
    get: function () {
        return conf.USER_AGENT;
    }
});
exports.qnHttpClient = new client.HttpClient({
    middlewares: [
        uaMiddleware
    ]
});
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

function postMultipart (requestURI, requestForm, callbackFunc) {
    return post(requestURI, requestForm, requestForm.headers(), callbackFunc);
}

function postWithForm (requestURI, requestForm, token, callbackFunc) {
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (token) {
        headers.Authorization = token;
    }
    return post(requestURI, requestForm, headers, callbackFunc);
}

function postWithoutForm (requestURI, token, callbackFunc) {
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (token) {
        headers.Authorization = token;
    }
    return post(requestURI, null, headers, callbackFunc);
}

function get (requestUrl, headers, callbackFunc) {
    const data = {
        dataType: 'json',
        timeout: conf.RPC_TIMEOUT
    };

    if (conf.RPC_HTTP_AGENT) {
        data.agent = conf.RPC_HTTP_AGENT;
    }

    if (conf.RPC_HTTPS_AGENT) {
        data.httpsAgent = conf.RPC_HTTPS_AGENT;
    }

    return exports.qnHttpClient.get({
        url: requestUrl,
        headers: headers,
        callback: callbackFunc
    }, data);
}

function post (requestURL, requestForm, headers, callbackFunc) {
    // var start = parseInt(Date.now() / 1000);
    const data = {
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

    return exports.qnHttpClient.post({
        url: requestURL,
        data: requestForm,
        headers: headers,
        callback: callbackFunc
    }, data);
}

function put (requestURL, requestForm, headers, callbackFunc) {
    // var start = parseInt(Date.now() / 1000);
    const data = {
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

    return exports.qnHttpClient.put({
        url: requestURL,
        data: requestForm,
        headers: headers,
        callback: callbackFunc
    }, data);
}
