const middleware = require('./base');
const util = require('../../util');

/**
 * @class
 * @extends middleware.Middleware
 * @param {Object} qiniuAuthOptions
 * @param {Mac} qiniuAuthOptions.mac
 * @constructor
 */
function QiniuAuthMiddleware (qiniuAuthOptions) {
    this.mac = qiniuAuthOptions.mac;
}

QiniuAuthMiddleware.prototype = Object.create(middleware.Middleware.prototype);
QiniuAuthMiddleware.prototype.constructor = QiniuAuthMiddleware;

/**
 * @memberOf QiniuAuthMiddleware
 * @param {ReqOpts} reqOpts
 * @param {function(ReqOpts):Promise<ResponseWrapper>} next
 * @return {Promise<ResponseWrapper>}
 */
QiniuAuthMiddleware.prototype.send = function (reqOpts, next) {
    const headers = reqOpts.urllibOptions.headers;
    if (this._shouldSignTime()) {
        headers['X-Qiniu-Date'] = util.formatDateUTC(new Date(), 'YYYYMMDDTHHmmssZ');
    }

    if (this.mac.accessKey) {
        headers.Authorization = util.generateAccessTokenV2(
            this.mac,
            reqOpts.url,
            reqOpts.urllibOptions.method,
            reqOpts.urllibOptions.contentType,
            reqOpts.urllibOptions.content,
            headers
        );
    }

    return next(reqOpts);
};

QiniuAuthMiddleware.prototype._shouldSignTime = function () {
    let shouldDisable = this.mac.options.disableQiniuTimestampSignature;
    if (shouldDisable === null) {
        const envDisable = process.env.DISABLE_QINIU_TIMESTAMP_SIGNATURE || '';
        shouldDisable = envDisable.toLowerCase() === 'true';
    }
    return !shouldDisable;
};

exports.QiniuAuthMiddleware = QiniuAuthMiddleware;
