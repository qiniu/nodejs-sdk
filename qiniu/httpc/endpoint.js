/**
 * @interface EndpointsProvider
 */

/**
 * @function
 * @name EndpointsProvider#getEndpoints
 * @returns {Promise<Endpoint[]>}
 */

/**
 * @interface MutableEndpointsProvider
 * @extends EndpointsProvider
 */

/**
 * @function
 * @name MutableEndpointsProvider#setEndpoints
 * @param {endpoints: Endpoint[]} endpoints
 * @returns {Promise<void>}
 */

// --- could split to files if migrate to typescript --- //

/**
 * @class
 * @implements EndpointsProvider
 * @param {string} host
 * @param {Object} [options]
 * @param {string} [options.defaultScheme]
 * @constructor
 */
function Endpoint (host, options) {
    options = options || {};

    this.host = host;
    this.defaultScheme = options.defaultScheme || 'https';
}

/**
 * @param {Object} [options]
 * @param {string} [options.scheme]
 */
Endpoint.prototype.getValue = function (options) {
    options = options || {};

    const scheme = options.scheme || this.defaultScheme;
    const host = this.host;

    return scheme + '://' + host;
};

/**
 * @returns {Promise<Endpoint[]>}
 */
Endpoint.prototype.getEndpoints = function () {
    return Promise.resolve([this]);
};

Endpoint.prototype.clone = function () {
    return new Endpoint(this.host, {
        defaultScheme: this.defaultScheme
    });
};

exports.Endpoint = Endpoint;
