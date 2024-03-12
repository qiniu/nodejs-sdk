/**
 * Middleware could be an interface if migrate to typescript
 * @class
 * @constructor
 */
function Middleware () {
}

/**
 * @memberOf Middleware
 * @param _request
 * @param _next
 */
Middleware.prototype.send = function (_request, _next) {
    throw new Error('The Middleware NOT be Implemented');
};

exports.Middleware = Middleware;

/**
 * @param {Middleware[]} middlewares
 * @param {function(ReqOpts):Promise<ResponseWrapper>} handler
 * @returns {function(ReqOpts):Promise<ResponseWrapper>}
 */
exports.composeMiddlewares = function (middlewares, handler) {
    return middlewares.reverse()
        .reduce(
            (h, mw) => request => mw.send(request, h),
            handler
        );
};
