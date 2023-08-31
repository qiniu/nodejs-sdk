const { Endpoint } = require('./endpoint');

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
 */
Region.fromZone = function (zone, options) {
    options = options || {};
    options.ttl = options.ttl || -1;

    const upHosts = options.isPreferCdnHost
        ? zone.cdnUpHosts.concat(zone.srcUpHosts)
        : zone.srcUpHosts.concat(zone.cdnUpHosts);

    const services = {
        // use array destructure if migrate to typescript
        [SERVICE_NAME.UP]: upHosts.map(
            h => new Endpoint(h)
        ),
        [SERVICE_NAME.IO]: [
            new Endpoint(zone.ioHost)
        ],
        [SERVICE_NAME.RS]: [
            new Endpoint(zone.rsHost)
        ],
        [SERVICE_NAME.RSF]: [
            new Endpoint(zone.rsfHost)
        ],
        [SERVICE_NAME.API]: [
            new Endpoint(zone.apiHost)
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
 * @param {Object.<ServiceKey, Endpoint[]>} [options.extendedServices]
 * @returns {Region}
 */
Region.fromRegionId = function (regionId, options) {
    options = options || {};

    const s3RegionId = options.s3RegionId || regionId;
    const ttl = options.ttl;
    const createTime = options.createTime;

    const isZ0 = regionId === 'z0';

    /**
     * @type {Object.<ServiceKey, Endpoint[]>}
     */
    let services = {
        [SERVICE_NAME.UC]: [
            new Endpoint('uc.qiniuapi.com')
        ],
        [SERVICE_NAME.UP]: isZ0
            ? [
                new Endpoint('upload.qiniup.com'),
                new Endpoint('up.qiniup.com'),
                new Endpoint('up.qbox.me')
            ]
            : [
                new Endpoint('upload-' + regionId + '.qiniup.com'),
                new Endpoint('up-' + regionId + '.qiniup.com'),
                new Endpoint('up-' + regionId + '.qbox.me')
            ],
        [SERVICE_NAME.IO]: isZ0
            ? [
                new Endpoint('iovip.qiniuio.com'),
                new Endpoint('iovip.qbox.me')
            ]
            : [
                new Endpoint('iovip-' + regionId + '.qiniuio.com'),
                new Endpoint('iovip-' + regionId + '.qbox.me')
            ],
        [SERVICE_NAME.RS]: [
            new Endpoint('rs-' + regionId + '.qiniuapi.com'),
            new Endpoint('rs-' + regionId + '.qbox.me')
        ],
        [SERVICE_NAME.RSF]: [
            new Endpoint('rsf-' + regionId + '.qiniuapi.com'),
            new Endpoint('rsf-' + regionId + '.qbox.me')
        ],
        [SERVICE_NAME.API]: [
            new Endpoint('api-' + regionId + '.qiniuapi.com'),
            new Endpoint('api-' + regionId + '.qbox.me')
        ],
        [SERVICE_NAME.S3]: [
            new Endpoint('s3.' + s3RegionId + '.qiniucs.com')
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

Object.defineProperty(Region.prototype, 'isLive', {
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
