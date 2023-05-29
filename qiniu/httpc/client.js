const http = require('http');
const https = require('https');

const urllib = require('urllib');

const middleware = require('./middleware');

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
                resolve({ data, resp });
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

exports.HttpClient = HttpClient;
