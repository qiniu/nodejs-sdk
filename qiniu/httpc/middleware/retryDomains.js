const middleware = require('./base');

/**
 * @class
 * @extends middleware.Middleware
 * @param {Object} retryDomainsOptions
 * @param {string[]} retryDomainsOptions.backupDomains
 * @param {number} [retryDomainsOptions.maxRetryTimes]
 * @param {function(Error || null, RespWrapper || null, ReqOpts):boolean} [retryDomainsOptions.retryCondition]
 * @constructor
 */
function RetryDomainsMiddleware (retryDomainsOptions) {
    this.backupDomains = retryDomainsOptions.backupDomains;
    this.maxRetryTimes = retryDomainsOptions.maxRetryTimes || 2;
    this.retryCondition = retryDomainsOptions.retryCondition;

    this._retriedTimes = 0;
}

RetryDomainsMiddleware.prototype = Object.create(middleware.Middleware.prototype);
RetryDomainsMiddleware.prototype.constructor = RetryDomainsMiddleware;

/**
 * @memberOf RetryDomainsMiddleware
 * @param {Error || null} err
 * @param {RespWrapper || null} respWrapper
 * @param {ReqOpts} reqOpts
 * @return {boolean}
 * @private
 */
RetryDomainsMiddleware.prototype._shouldRetry = function (err, respWrapper, reqOpts) {
    if (typeof this.retryCondition === 'function') {
        return this.retryCondition(err, respWrapper, reqOpts);
    }

    return !respWrapper ||
        !respWrapper.resp ||
        Math.floor(respWrapper.resp.statusCode / 100) !== 2;
};

/**
 * @memberOf RetryDomainsMiddleware
 * @param {ReqOpts} reqOpts
 * @param {function(ReqOpts):Promise<RespWrapper>} next
 * @return {Promise<RespWrapper>}
 */
RetryDomainsMiddleware.prototype.send = function (reqOpts, next) {
    const url = new URL(reqOpts.url);
    const domains = this.backupDomains.slice(); // copy for late pop

    const couldRetry = () => {
        // the reason `this.maxRetryTimes - 1` is request send first then add retriedTimes
        // and `this.maxRetryTimes` means max request times per domain
        if (this._retriedTimes < this.maxRetryTimes - 1) {
            this._retriedTimes += 1;
            return true;
        }

        if (domains.length) {
            this._retriedTimes = 0;
            url.hostname = domains.shift();
            reqOpts.url = url.toString();
            return true;
        }

        return false;
    };

    const tryNext = () => {
        return next(reqOpts)
            .then(respWrapper => {
                if (!this._shouldRetry(null, respWrapper, reqOpts)) {
                    return respWrapper;
                }

                if (couldRetry()) {
                    return tryNext();
                }

                return respWrapper;
            })
            .catch(err => {
                if (!this._shouldRetry(err, null, reqOpts)) {
                    return Promise.reject(err);
                }

                if (couldRetry()) {
                    return tryNext();
                }

                return Promise.reject(err);
            });
    };

    return tryNext();
};

exports.RetryDomainsMiddleware = RetryDomainsMiddleware;
