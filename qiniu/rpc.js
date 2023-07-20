const pkg = require('../package.json');
const conf = require('./conf');
const digest = require('./auth/digest');
const client = require('./httpc/client');
const middleware = require('./httpc/middleware');
const { AuthMiddleware } = require('./httpc/middleware/auth');

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

function getWithOptions (requestURI, options, callbackFunc) {
    const headers = options.headers || {};
    const mac = options.mac || new digest.Mac();
    let middlewares = options.middlewares || [];

    if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    // add build-in middlewares
    middlewares = middlewares.concat([
        new AuthMiddleware({
            mac: mac
        })
    ]);

    // urllib options
    const urllibOptions = {
        dataType: 'json',
        timeout: conf.RPC_TIMEOUT
    };

    if (conf.RPC_HTTP_AGENT) {
        urllibOptions.agent = conf.RPC_HTTP_AGENT;
    }

    if (conf.RPC_HTTPS_AGENT) {
        urllibOptions.httpsAgent = conf.RPC_HTTPS_AGENT;
    }

    return exports.qnHttpClient.get({
        url: requestURI,
        headers: headers,
        middlewares: middlewares,
        callback: callbackFunc
    }, urllibOptions);
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
    const headers = options.headers || {};
    const mac = options.mac || new digest.Mac();
    let middlewares = options.middlewares || [];

    if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    // add build-in middlewares
    middlewares = middlewares.concat([
        new AuthMiddleware({
            mac: mac
        })
    ]);

    // urllib options
    const urllibOptions = {
        dataType: 'json',
        timeout: conf.RPC_TIMEOUT,
        gzip: true
    };

    if (conf.RPC_HTTP_AGENT) {
        urllibOptions.agent = conf.RPC_HTTP_AGENT;
    }

    if (conf.RPC_HTTPS_AGENT) {
        urllibOptions.httpsAgent = conf.RPC_HTTPS_AGENT;
    }

    // result
    return exports.qnHttpClient.post({
        url: requestURI,
        data: requestForm,
        headers: headers,
        middlewares: middlewares,
        callback: callbackFunc
    }, urllibOptions);
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
