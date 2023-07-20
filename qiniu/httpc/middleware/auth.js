const middleware = require('./base');
const util = require('../../util');

/**
 * @class
 * @extends middleware.Middleware
 * @param {Object} authOptions
 * @param {Object} authOptions.mac
 * @constructor
 */
function AuthMiddleware (authOptions) {
    this.mac = authOptions.mac;
}

AuthMiddleware.prototype = Object.create(middleware.Middleware.prototype);
AuthMiddleware.prototype.constructor = AuthMiddleware;

/**
 * @memberOf AuthMiddleware
 * @private
 * @return {Object}
 */
AuthMiddleware.prototype._getAuthHeaders = function () {
    const headers = {};
    const xQiniuDate = util.formatDateUTC(new Date(), 'YYYYMMDDTHHmmssZ');
    if (this.mac.options.disableQiniuTimestampSignature !== null) {
        if (!this.mac.options.disableQiniuTimestampSignature) {
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
};

/**
 * @memberOf AuthMiddleware
 * @param {ReqOpts} reqOpts
 * @param {function(ReqOpts):Promise<RespWrapper>} next
 * @return {Promise<RespWrapper>}
 */
AuthMiddleware.prototype.send = function (reqOpts, next) {
    Object.assign(reqOpts.urllibOptions.headers, this._getAuthHeaders());

    if (this.mac.accessKey) {
        reqOpts.urllibOptions.headers.Authorization = util.generateAccessTokenV2(
            this.mac,
            reqOpts.url,
            reqOpts.urllibOptions.method,
            reqOpts.urllibOptions.headers['Content-Type'],
            reqOpts.urllibOptions.data,
            reqOpts.urllibOptions.headers
        );
    }

    return next(reqOpts);
};

exports.AuthMiddleware = AuthMiddleware;
