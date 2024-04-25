const {
    RetryPolicy
} = require('../retry');
const {
    StaticEndpointsProvider
} = require('./endpointsProvider');

/**
 * @typedef {RetryPolicyContext} EndpointsRetryPolicyContext
 * @property {Endpoint} endpoint
 * @property {Endpoint[]} alternativeEndpoints
 */

/**
 * @class
 * @extends RetryPolicy
 * @param {boolean} [options.skipInitContext]
 * @param {Endpoint[]} [options.endpoints]
 * @param {EndpointsProvider} [options.endpointsProvider]
 * @constructor
 */
function EndpointsRetryPolicy (options) {
    this.skipInitContext = options.skipInitContext || false;
    this.endpoints = options.endpoints || [];
    this.endpointsProvider = options.endpointsProvider || new StaticEndpointsProvider([]);
}

EndpointsRetryPolicy.prototype = Object.create(RetryPolicy.prototype);
EndpointsRetryPolicy.prototype.constructor = EndpointsRetryPolicy;

/**
 * @param {EndpointsRetryPolicyContext} context
 * @returns {Promise<void>}
 */
EndpointsRetryPolicy.prototype.initContext = function (context) {
    if (this.skipInitContext) {
        return Promise.resolve();
    }
    if (this.endpoints.length > 0) {
        [context.endpoint, ...context.alternativeEndpoints] = this.endpoints.slice();
        return Promise.resolve();
    }
    return this.endpointsProvider.getEndpoints()
        .then(endpoints => {
            if (endpoints.length < 0) {
                return Promise.reject(
                    new Error('There isn\'t available endpoint')
                );
            }
            [context.endpoint, ...context.alternativeEndpoints] = endpoints.slice();
        });
};

/**
 * @param {EndpointsRetryPolicyContext} context
 * @returns {boolean}
 */
EndpointsRetryPolicy.prototype.shouldRetry = function (context) {
    return context.alternativeEndpoints.length > 0;
};

/**
 * @param {EndpointsRetryPolicyContext} context
 * @returns {Promise<void>}
 */
EndpointsRetryPolicy.prototype.prepareRetry = function (context) {
    context.endpoint = context.alternativeEndpoints.shift();
    if (!context.endpoint) {
        return Promise.reject(
            new Error('There isn\'t available endpoint for next try')
        );
    }
    return Promise.resolve();
};

exports.EndpointsRetryPolicy = EndpointsRetryPolicy;
