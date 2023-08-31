/**
 * @class
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

exports.Endpoint = Endpoint;
