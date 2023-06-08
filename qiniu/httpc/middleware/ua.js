const os = require('os');

const middleware = require('./base');

/**
 * @class
 * @extends middleware.Middleware
 * @param {string} sdkVersion
 * @constructor
 */
function UserAgentMiddleware (sdkVersion) {
    this.userAgent = 'QiniuNodejs/' + sdkVersion +
        ' (' +
        os.type() + '; ' +
        os.platform() + '; ' +
        os.arch() + '; ' +
        'Node.js ' + process.version + '; )';
}
UserAgentMiddleware.prototype = Object.create(middleware.Middleware.prototype);
UserAgentMiddleware.prototype.constructor = UserAgentMiddleware;

/**
 * @memberOf UserAgentMiddleware
 * @param {ReqOpts} reqOpts
 * @param {function(ReqOpts):Promise} next
 * @return {Promise}
 */
UserAgentMiddleware.prototype.send = function (reqOpts, next) {
    if (!reqOpts.urllibOptions.headers) {
        reqOpts.urllibOptions.headers = {};
    }
    reqOpts.urllibOptions.headers['User-Agent'] = this.userAgent;
    return next(reqOpts);
};

exports.UserAgentMiddleware = UserAgentMiddleware;
