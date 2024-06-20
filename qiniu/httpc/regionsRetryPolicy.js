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
 * @property {SERVICE_NAME} serviceName
 * @property {SERVICE_NAME[]} alternativeServiceNames
 */

/**
 * @class
 * @extends RetryPolicy
 * @param {SERVICE_NAME} options.serviceName DEPRECATE: use options.serviceNames instead
 * @param {SERVICE_NAME[]} options.serviceNames
 * @param {Region[]} [options.regions]
 * @param {RegionsProvider} [options.regionsProvider]
 * @param {Endpoint[]} [options.preferredEndpoints]
 * @param {EndpointsProvider} [options.preferredEndpointsProvider]
 * @param {function(RegionsRetryPolicyContext): Promise<void>} [options.onChangedRegion]
 * @constructor
 */
function RegionsRetryPolicy (options) {
    /**
     * @type {SERVICE_NAME[]}
     */
    this.serviceNames = options.serviceNames || [];
    if (!this.serviceNames.length) {
        this.serviceNames = [options.serviceName];
    }
    if (!this.serviceNames.length) {
        throw new TypeError('Must provide one service name at least');
    }
    // compatible, remove when make break changes
    this.serviceName = this.serviceNames[0];

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
 * @returns {Promise<void>}
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
 * @returns {boolean}
 */
RegionsRetryPolicy.prototype.shouldRetry = function (context) {
    return context.alternativeRegions.length > 0 || context.alternativeServiceNames.length > 0;
};

/**
 * @param {RegionsRetryPolicyContext} context
 * @returns {Promise<void>}
 */
RegionsRetryPolicy.prototype.prepareRetry = function (context) {
    if (context.alternativeServiceNames.length) {
        context.serviceName = context.alternativeServiceNames.shift();
    } else if (context.alternativeRegions.length) {
        context.region = context.alternativeRegions.shift();
        [context.serviceName, ...context.alternativeServiceNames] = this.serviceNames;
    } else {
        return Promise.reject(
            new Error('There isn\'t available region or service for next try')
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
 * @typedef GetPreferredRegionInfoResult
 * @property {number} preferredServiceIndex
 * @property {number} preferredRegionIndex
 */

/**
 * @param {Region[]} options.regions
 * @param {Endpoint[]} options.preferredEndpoints
 * @returns {GetPreferredRegionInfoResult}
 * @protected
 */
RegionsRetryPolicy.prototype._getPreferredRegionInfo = function (options) {
    const {
        regions,
        preferredEndpoints
    } = options;

    const serviceNames = this.serviceNames.slice();

    let preferredServiceIndex = -1;
    const preferredRegionIndex = regions.findIndex(r =>
        serviceNames.some((s, si) =>
            r.services[s].some(e => {
                const res = preferredEndpoints.some(pe => pe.host === e.host);
                if (res) {
                    preferredServiceIndex = si;
                }
                return res;
            })
        )
    );
    return {
        preferredServiceIndex,
        preferredRegionIndex
    };
};

/**
 * @param {RegionsRetryPolicyContext} options.context
 * @param {Region[]} options.regions
 * @param {Endpoint[]} options.preferredEndpoints
 * @returns {Promise<void>}
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
        [context.serviceName, ...context.alternativeServiceNames] = this.serviceNames;
        return Promise.resolve();
    }

    // find preferred serviceName and region by preferred endpoints
    const {
        preferredRegionIndex,
        preferredServiceIndex
    } = this._getPreferredRegionInfo({
        regions,
        preferredEndpoints
    });

    // initialize the order of serviceNames and regions
    if (preferredRegionIndex < 0) {
        // preferred endpoints is not a region, then make all regions alternative
        [context.serviceName, ...context.alternativeServiceNames] = this.serviceNames;
        // compatible, remove when make break changes
        this.serviceName = context.serviceName;

        context.region = new Region({
            services: {
                [context.serviceName]: preferredEndpoints
            }
        });
        context.alternativeRegions = regions;
    } else {
        // preferred endpoints in a known region, then reorder the regions and services
        context.alternativeRegions = regions;
        [context.region] = context.alternativeRegions.splice(preferredRegionIndex, 1);
        context.alternativeServiceNames = this.serviceNames.slice();
        [context.serviceName] = context.alternativeServiceNames.splice(preferredServiceIndex, 1);
        // compatible, remove when make break changes
        this.serviceName = context.serviceName;
    }
    return Promise.resolve();
};

/**
 * @param {RegionsRetryPolicyContext} context
 * @returns {Promise<void>}
 * @protected
 */
RegionsRetryPolicy.prototype._prepareEndpoints = function (context) {
    [context.endpoint, ...context.alternativeEndpoints] = context.region.services[context.serviceName] || [];
    while (!context.endpoint) {
        if (context.alternativeServiceNames.length) {
            context.serviceName = context.alternativeServiceNames.shift();
            // compatible, remove when make break changes
            this.serviceName = context.serviceName;
            [context.endpoint, ...context.alternativeEndpoints] = context.region.services[context.serviceName] || [];
        } else if (context.alternativeRegions.length) {
            context.region = context.alternativeRegions.shift();
            [context.serviceName, ...context.alternativeServiceNames] = this.serviceNames;
            // compatible, remove when make break changes
            this.serviceName = context.serviceName;
            [context.endpoint, ...context.alternativeEndpoints] = context.region.services[context.serviceName] || [];
        } else {
            return Promise.reject(new Error(
                'There isn\'t available endpoint for ' +
                this.serviceNames.join(', ') +
                ' service(s) in any available regions'
            ));
        }
    }
    return Promise.resolve();
};

exports.RegionsRetryPolicy = RegionsRetryPolicy;
