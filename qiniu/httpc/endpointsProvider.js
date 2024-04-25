/**
 * @class
 * @implements EndpointsProvider
 * @property {Endpoint[]} endpoints
 * @constructor
 * @param {Endpoint[]} endpoints
 */
function StaticEndpointsProvider (endpoints) {
    this.endpoints = endpoints;
}

/**
 * @param {Region} region
 * @param {string} serviceName
 */
StaticEndpointsProvider.fromRegion = function (region, serviceName) {
    return new StaticEndpointsProvider(region.services[serviceName]);
};

/**
 * @returns {Promise<Endpoint[]>}
 */
StaticEndpointsProvider.prototype.getEndpoints = function () {
    return Promise.resolve(this.endpoints);
};

exports.StaticEndpointsProvider = StaticEndpointsProvider;
