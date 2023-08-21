/**
 * @interface EndpointsProvider
 */

/**
 * @function
 * @name EndpointsProvider#setEndpoints
 * @param {endpoints: Endpoint[]} endpoints
 * @returns {Promise<void>}
 */

/**
 * @function
 * @name EndpointsProvider#getEndpoints
 * @returns {Promise<Endpoint[]>}
 */

// --- could split to files if migrate to typescript --- //

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

/**
 * @param {Endpoint[]} endpoints
 * @returns {Promise<void>}
 */
StaticEndpointsProvider.prototype.setEndpoints = function (endpoints) {
    this.endpoints = endpoints;
    return Promise.resolve();
};

/**
 * @param {RegionsProvider} regionsProvider
 * @param {string} serviceName
 * @returns {Promise<EndpointsProvider[]>}
 */
function getEndpointsProvidersFromRegionsProvider (regionsProvider, serviceName) {
    return regionsProvider.getRegions()
        .then(regions => {
            return regions.map(r => StaticEndpointsProvider.fromRegion(r, serviceName));
        });
}

exports.StaticEndpointsProvider = StaticEndpointsProvider;
exports.getEndpointsProvidersFromRegionsProvider = getEndpointsProvidersFromRegionsProvider;
