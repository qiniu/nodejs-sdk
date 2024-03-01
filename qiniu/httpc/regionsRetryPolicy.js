const {
    RetryPolicy
} = require('../retry');
const { Region } = require('./region');
const {
    StaticRegionsProvider
} = require('./regionsProvider');
const {
    StaticEndpointsProvider
} = require('./endpointsProvider');

/**
 * @typedef {EndpointsRetryPolicyContext} RegionsRetryPolicyContext
 * @property {Region} region
 * @property {Region[]} alternativeRegions
 */

/**
 * @class
 * @extends RetryPolicy
 * @param {SERVICE_NAME} options.serviceName
 * @param {Region[]} [options.regions]
 * @param {RegionsProvider} [options.regionsProvider]
 * @param {Endpoint[]} [options.preferredEndpoints]
 * @param {EndpointsProvider} [options.preferredEndpointsProvider]
 * @param {function(RegionsRetryPolicyContext): Promise<void>} [options.onChangedRegion]
 * @constructor
 */
function RegionsRetryPolicy (options) {
    this.serviceName = options.serviceName;
    this.regions = options.regions || [];
    this.regionsProvider = options.regionsProvider || new StaticRegionsProvider([]);
    this.preferredEndpoints = options.preferredEndpoints || [];
    this.preferredEndpointsProvider = options.preferredEndpointsProvider || new StaticEndpointsProvider([]);
    this.onChangedRegion = options.onChangedRegion;
}

RegionsRetryPolicy.prototype = Object.create(RetryPolicy.prototype);
RegionsRetryPolicy.prototype.constructor = RegionsRetryPolicy;

/**
 * @param {RegionsRetryPolicyContext} context
 * @return {Promise<void>}
 */
RegionsRetryPolicy.prototype.initContext = function (context) {
    const regionsPromise = this.regions.length > 0
        ? this.regions
        : this.regionsProvider.getRegions();
    const preferredEndpointsPromise = this.preferredEndpoints.length > 0
        ? this.preferredEndpoints
        : this.preferredEndpointsProvider.getEndpoints();
    return Promise.all([
        regionsPromise,
        preferredEndpointsPromise
    ])
        .then(([regions, preferredEndpoints]) => this._initRegions({
            context,
            regions: regions.slice(),
            preferredEndpoints: preferredEndpoints.slice()
        }))
        .then(() => this._prepareEndpoints(context));
};

/**
 * @param {RegionsRetryPolicyContext} context
 * @return {boolean}
 */
RegionsRetryPolicy.prototype.shouldRetry = function (context) {
    return context.alternativeRegions.length > 0;
};

/**
 * @param {RegionsRetryPolicyContext} context
 * @return {Promise<void>}
 */
RegionsRetryPolicy.prototype.prepareRetry = function (context) {
    context.region = context.alternativeRegions.shift();
    if (!context.region) {
        return Promise.reject(
            new Error('There isn\'t available region for next try')
        );
    }
    return this._prepareEndpoints(context)
        .then(() => {
            if (typeof this.onChangedRegion === 'function') {
                return this.onChangedRegion(context);
            }
        });
};

/**
 * @param {RegionsRetryPolicyContext} options.context
 * @param {Region[]} options.regions
 * @param {Endpoint[]} options.preferredEndpoints
 * @return {Promise<void>}
 * @private
 */
RegionsRetryPolicy.prototype._initRegions = function (options) {
    const {
        context,
        regions,
        preferredEndpoints
    } = options;
    // initial region and alternative regions
    if (!regions.length && !preferredEndpoints.length) {
        return Promise.reject(
            new Error('There isn\'t available region or preferred endpoint')
        );
    }

    if (!preferredEndpoints.length) {
        [context.region, ...context.alternativeRegions] = regions;
        return Promise.resolve();
    }

    // find preferred region by preferred endpoints
    const preferredRegionIndex = regions.findIndex(r =>
        r.services[this.serviceName].some(e =>
            preferredEndpoints.some(pe => pe.host === e.host)
        )
    );
    if (preferredRegionIndex < 0) {
        // preferred endpoints is not a region, then make all regions alternative
        context.region = new Region({
            services: {
                [this.serviceName]: preferredEndpoints
            }
        });
        context.alternativeRegions = regions;
    } else {
        // preferred endpoints is a region, then reorder the regions
        [context.region] = regions.splice(preferredRegionIndex, 1);
        context.alternativeRegions = regions;
    }
    return Promise.resolve();
};

/**
 * @param {RegionsRetryPolicyContext} context
 * @return {Promise<void>}
 * @private
 */
RegionsRetryPolicy.prototype._prepareEndpoints = function (context) {
    [context.endpoint, ...context.alternativeEndpoints] = context.region.services[this.serviceName] || [];
    while (!context.endpoint) {
        if (!context.alternativeRegions.length) {
            return Promise.reject(new Error(
                'There isn\'t available endpoint for ' +
                this.serviceName +
                ' service in any available regions'
            ));
        }
        context.region = context.alternativeRegions.shift();
        [context.endpoint, ...context.alternativeEndpoints] = context.region.services[this.serviceName] || [];
    }
    return Promise.resolve();
};

exports.RegionsRetryPolicy = RegionsRetryPolicy;
