const base = require('./base');

module.exports = {
    composeMiddlewares: base.composeMiddlewares,
    Middleware: base.Middleware,
    RetryDomainsMiddleware: require('./retryDomains').RetryDomainsMiddleware,
    UserAgentMiddleware: require('./ua').UserAgentMiddleware,
    QiniuAuthMiddleware: require('./qiniuAuth').QiniuAuthMiddleware
};
