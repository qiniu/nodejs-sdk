function Endpoint (host, options) {
    options = options || {};

    this.host = host;
    this.defaultScheme = options.defaultScheme || 'https';
}

/**
 * @typedef EndpointPersistInfo
 * @property {string} host
 * @property {string} defaultScheme
 */

/**
 * @param {EndpointPersistInfo} persistInfo
 * @returns {Endpoint}
 */
Endpoint.fromPersistInfo = function (persistInfo) {
    return new Endpoint(persistInfo.host, {
        defaultScheme: persistInfo.defaultScheme
    });
};

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

Object.defineProperty(Endpoint.prototype, 'persistInfo', {
    /**
     * @returns {EndpointPersistInfo}
     */
    get: function () {
        return {
            defaultScheme: this.defaultScheme,
            host: this.host
        };
    },
    enumerable: false,
    configurable: true
});

exports.Endpoint = Endpoint;
