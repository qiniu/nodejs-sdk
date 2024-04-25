const { Endpoint } = require('./endpoint');

/**
 * @interface RegionsProvider
 */

/**
 * @function
 * @name RegionsProvider#getRegions
 * @returns {Promise<Region[]>}
 */

/**
 * @interface MutableRegionsProvider
 * @extends RegionsProvider
 */

/**
 * @function
 * @name MutableRegionsProvider#setRegions
 * @param {Region[]} regions
 * @returns {Promise<void>}
 */

// --- could split to files if migrate to typescript --- //

/**
 * @readonly
 * @enum {string}
 */
const SERVICE_NAME = {
    UC: 'uc',
    UP: 'up',
    IO: 'io',
    RS: 'rs',
    RSF: 'rsf',
    API: 'api',
    S3: 's3'
};

// --- could split to files if migrate to typescript --- //

/**
 * @typedef {SERVICE_NAME | string} ServiceKey
 */

/**
 * @class
 * @implements RegionsProvider
 * @param {Object} options
 * @param {string} [options.regionId]
 * @param {string} [options.s3RegionId]
 * @param {Object.<ServiceKey, Endpoint[]>} [options.services]
 * @param {number} [options.ttl] seconds. default 1 day.
 * @param {Date} [options.createTime]
 * @constructor
 */
function Region (options) {
    this.regionId = options.regionId;
    this.s3RegionId = options.s3RegionId || options.regionId;

    this.services = options.services || {};
    // use Object.values when min version of Node.js update to ≥ v7.5.0
    Object.keys(SERVICE_NAME).map(k => {
        const v = SERVICE_NAME[k];
        if (!Array.isArray(this.services[v])) {
            this.services[v] = [];
        }
    });

    this.ttl = options.ttl || 86400;
    this.createTime = options.createTime || new Date();
}

/**
 * This is used to be compatible with Zone.
 * So this function will be removed after remove Zone.
 * NOTE: The Region instance obtained using this method
 *  can only be used for the following services: up, io, rs, rsf, api.
 *  Because the Zone not support other services.
 * @param {conf.Zone} zone
 * @param {Object} [options]
 * @param {string} [options.regionId]
 * @param {string} [options.s3RegionId]
 * @param {number} [options.ttl]
 * @param {boolean} [options.isPreferCdnHost]
 * @param {string} [options.preferredScheme]
 */
Region.fromZone = function (zone, options) {
    options = options || {};
    options.ttl = options.ttl || -1;

    const upHosts = options.isPreferCdnHost
        ? zone.cdnUpHosts.concat(zone.srcUpHosts)
        : zone.srcUpHosts.concat(zone.cdnUpHosts);

    const endpointOptions = {};
    if (options.preferredScheme) {
        endpointOptions.defaultScheme = options.preferredScheme;
    }

    const services = {
        // use array destructure if migrate to typescript
        [SERVICE_NAME.UP]: upHosts.map(
            h => new Endpoint(h, endpointOptions)
        ),
        [SERVICE_NAME.IO]: [
            new Endpoint(zone.ioHost, endpointOptions)
        ],
        [SERVICE_NAME.RS]: [
            new Endpoint(zone.rsHost, endpointOptions)
        ],
        [SERVICE_NAME.RSF]: [
            new Endpoint(zone.rsfHost, endpointOptions)
        ],
        [SERVICE_NAME.API]: [
            new Endpoint(zone.apiHost, endpointOptions)
        ]
    };

    return new Region({
        regionId: options.regionId,
        s3RegionId: options.s3RegionId || options.regionId,
        services: services,
        ttl: options.ttl
    });
};

/**
 * @param {string} regionId
 * @param {Object} [options]
 * @param {string} [options.s3RegionId]
 * @param {number} [options.ttl]
 * @param {Date} [options.createTime]
 * @param {string} [options.preferredScheme]
 * @param {boolean} [options.isPreferCdnUpHost]
 * @param {Object.<ServiceKey, Endpoint[]>} [options.extendedServices]
 * @returns {Region}
 */
Region.fromRegionId = function (regionId, options) {
    options = options || {};

    const s3RegionId = options.s3RegionId || regionId;
    const ttl = options.ttl;
    const createTime = options.createTime;
    const isPreferCdnUpHost = typeof options.isPreferCdnUpHost === 'boolean'
        ? options.isPreferCdnUpHost
        : true;

    const endpointOptions = {};
    if (options.preferredScheme) {
        endpointOptions.defaultScheme = options.preferredScheme;
    }

    const isZ0 = regionId === 'z0';
    let upCdnEndpoints;
    let upSourceEndpoints;
    if (isZ0) {
        upCdnEndpoints = [
            new Endpoint(
                'upload.qiniup.com',
                endpointOptions
            )
        ];
        upSourceEndpoints = [
            new Endpoint(
                'up.qiniup.com',
                endpointOptions
            ),
            new Endpoint(
                'up.qbox.me',
                endpointOptions
            )
        ];
    } else {
        upCdnEndpoints = [
            new Endpoint(
                'upload-' + regionId + '.qiniup.com',
                endpointOptions
            )
        ];
        upSourceEndpoints = [
            new Endpoint(
                'up-' + regionId + '.qiniup.com',
                endpointOptions
            ),
            new Endpoint(
                'up-' + regionId + '.qbox.me',
                endpointOptions
            )
        ];
    }

    /**
     * @type {Object.<ServiceKey, Endpoint[]>}
     */
    let services = {
        [SERVICE_NAME.UC]: [
            new Endpoint(
                'uc.qiniuapi.com',
                endpointOptions
            )
        ],
        [SERVICE_NAME.UP]: isPreferCdnUpHost
            ? upCdnEndpoints.concat(upSourceEndpoints)
            : upSourceEndpoints.concat(upCdnEndpoints),
        [SERVICE_NAME.IO]: isZ0
            ? [
                new Endpoint(
                    'iovip.qiniuio.com',
                    endpointOptions
                ),
                new Endpoint(
                    'iovip.qbox.me',
                    endpointOptions
                )
            ]
            : [
                new Endpoint(
                    'iovip-' + regionId + '.qiniuio.com',
                    endpointOptions
                ),
                new Endpoint(
                    'iovip-' + regionId + '.qbox.me',
                    endpointOptions
                )
            ],
        [SERVICE_NAME.RS]: [
            new Endpoint(
                'rs-' + regionId + '.qiniuapi.com',
                endpointOptions
            ),
            new Endpoint(
                'rs-' + regionId + '.qbox.me',
                endpointOptions
            )
        ],
        [SERVICE_NAME.RSF]: [
            new Endpoint(
                'rsf-' + regionId + '.qiniuapi.com',
                endpointOptions
            ),
            new Endpoint(
                'rsf-' + regionId + '.qbox.me',
                endpointOptions
            )
        ],
        [SERVICE_NAME.API]: [
            new Endpoint(
                'api-' + regionId + '.qiniuapi.com',
                endpointOptions
            ),
            new Endpoint(
                'api-' + regionId + '.qbox.me',
                endpointOptions
            )
        ],
        [SERVICE_NAME.S3]: [
            new Endpoint(
                's3.' + s3RegionId + '.qiniucs.com',
                endpointOptions
            )
        ]
    };

    services = Object.assign(services, options.extendedServices || {});

    return new Region({
        regionId: regionId,
        s3RegionId: s3RegionId,
        services: services,
        ttl: ttl,
        createTime: createTime
    });
};

/**
 * @returns {Promise<Region[]>}
 */
Region.prototype.getRegions = function () {
    return Promise.resolve([this]);
};

Object.defineProperty(Region.prototype, 'isLive', {
    /**
     * @returns {boolean}
     */
    get: function () {
        if (this.ttl < 0) {
            return true;
        }
        // convert ms to s
        const liveTime = Math.round((Date.now() - this.createTime) / 1000);
        return liveTime < this.ttl;
    },
    enumerable: false,
    configurable: true
});

exports.SERVICE_NAME = SERVICE_NAME;
exports.Region = Region;
