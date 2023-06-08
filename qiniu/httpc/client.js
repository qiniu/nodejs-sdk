const http = require('http');
const https = require('https');

const urllib = require('urllib');

const middleware = require('./middleware');
const { ResponseWrapper } = require('./responseWrapper');

/**
 *
 * @param {Object} options
 * @param {http.Agent} [options.httpAgent]
 * @param {https.Agent} [options.httpsAgent]
 * @param {middleware.Middleware[]} [options.middlewares]
 *
 * @constructor
 */
function HttpClient (options) {
    this.httpAgent = options.httpAgent || http.globalAgent;
    this.httpsAgent = options.httpsAgent || https.globalAgent;
    this.middlewares = options.middlewares || [];
}

HttpClient.prototype._handleRequest = function (req) {
    return new Promise((resolve, reject) => {
        try {
            urllib.request(req.url, req.urllibOptions, (err, data, resp) => {
                if (err) {
                    err.resp = resp;
                    reject(err);
                    return;
                }
                resolve(new ResponseWrapper({ data, resp }));
            });
        } catch (e) {
            reject(e);
        }
    });
};

/**
 * Options for request
 * @typedef {Object} ReqOpts
 * @property {http.Agent} [agent]
 * @property {https.Agent} [httpsAgent]
 * @property {string} url
 * @property {middleware.Middleware[]} middlewares
 * @property {urllib.Callback} callback
 * @property {urllib.RequestOptions} urllibOptions
 */

/**
 * Wrapped result of request
 * @typedef {Object} RespWrapper
 * @property {*} data
 * @property {http.IncomingMessage} resp
 */

/**
 *
 * @param {ReqOpts} requestOptions
 * @return {Promise<RespWrapper>}
 */
HttpClient.prototype.sendRequest = function (requestOptions) {
    const mwList = this.middlewares.concat(requestOptions.middlewares);

    if (!requestOptions.agent) {
        requestOptions.agent = this.httpAgent;
    }

    if (!requestOptions.httpsAgent) {
        requestOptions.httpsAgent = this.httpsAgent;
    }

    const handle = middleware.composeMiddlewares(
        mwList,
        this._handleRequest
    );

    const resPromise = handle(requestOptions);

    if (requestOptions.callback) {
        resPromise
            .then(({ data, resp }) =>
                requestOptions.callback(null, data, resp)
            )
            .catch(err => {
                requestOptions.callback(err, null, err.resp);
            });
    }

    return resPromise;
};

/**
 * @param {Object} reqOptions
 * @param {string} reqOptions.url
 * @param {http.Agent} [reqOptions.agent]
 * @param {https.Agent} [reqOptions.httpsAgent]
 * @param {Object} [reqOptions.params]
 * @param {Object} [reqOptions.headers]
 * @param {middleware.Middleware[]} [reqOptions.middlewares]
 * @param {urllib.RequestOptions} [urllibOptions]
 * @return {Promise<RespWrapper>}
 */
HttpClient.prototype.get = function (reqOptions, urllibOptions) {
    const {
        url,
        params,
        headers,
        middlewares,
        agent,
        httpsAgent,
        callback
    } = reqOptions;

    urllibOptions = urllibOptions || {};
    urllibOptions.method = 'GET';
    urllibOptions.headers = Object.assign(
        {
            Connection: 'keep-alive'
        },
        headers,
        urllibOptions.headers || {}
    );
    urllibOptions.data = params;
    urllibOptions.followRedirect = true;

    return this.sendRequest({
        url: url,
        middlewares: middlewares || [],
        agent: agent,
        httpsAgent: httpsAgent,
        callback: callback,
        urllibOptions: urllibOptions
    });
};

/**
 * @param {Object} reqOptions
 * @param {string} reqOptions.url
 * @param {http.Agent} [reqOptions.agent]
 * @param {https.Agent} [reqOptions.httpsAgent]
 * @param {string | Buffer | Readable} [reqOptions.data]
 * @param {Object} [reqOptions.headers]
 * @param {middleware.Middleware[]} [reqOptions.middlewares]
 * @param {urllib.RequestOptions} [urllibOptions]
 * @return {Promise<RespWrapper>}
 */
HttpClient.prototype.post = function (reqOptions, urllibOptions) {
    const {
        url,
        data,
        headers,
        middlewares,
        agent,
        httpsAgent,
        callback
    } = reqOptions;

    urllibOptions = urllibOptions || {};
    urllibOptions.method = 'POST';
    urllibOptions.headers = Object.assign(
        {
            Connection: 'keep-alive'
        },
        headers,
        urllibOptions.headers || {}
    );
    urllibOptions.gzip = true;

    if (Buffer.isBuffer(data) || typeof data === 'string') {
        urllibOptions.content = data;
    } else if (data) {
        urllibOptions.stream = data;
    } else {
        urllibOptions.headers['Content-Length'] = '0';
    }

    return this.sendRequest({
        url: url,
        middlewares: middlewares || [],
        agent: agent,
        httpsAgent: httpsAgent,
        callback: callback,
        urllibOptions: urllibOptions
    });
};

/**
 * @param {Object} reqOptions
 * @param {string} reqOptions.url
 * @param {http.Agent} [reqOptions.agent]
 * @param {https.Agent} [reqOptions.httpsAgent]
 * @param {string | Buffer | ReadableStream} [reqOptions.data]
 * @param {Object} [reqOptions.headers]
 * @param {middleware.Middleware[]} [reqOptions.middlewares]
 * @param {urllib.RequestOptions} [urllibOptions]
 * @return {Promise<RespWrapper>}
 */
HttpClient.prototype.put = function (reqOptions, urllibOptions) {
    const {
        url,
        data,
        headers,
        middlewares,
        agent,
        httpsAgent,
        callback
    } = reqOptions;

    urllibOptions = urllibOptions || {};
    urllibOptions.method = 'PUT';
    urllibOptions.headers = Object.assign(
        {
            Connection: 'keep-alive'
        },
        headers,
        urllibOptions.headers || {}
    );
    urllibOptions.gzip = true;

    if (Buffer.isBuffer(data) || typeof data === 'string') {
        urllibOptions.content = data;
    } else if (data) {
        urllibOptions.stream = data;
    } else {
        urllibOptions.headers['Content-Length'] = '0';
    }

    return this.sendRequest({
        url: url,
        middlewares: middlewares || [],
        agent: agent,
        httpsAgent: httpsAgent,
        callback: callback,
        urllibOptions: urllibOptions
    });
};

exports.HttpClient = HttpClient;
