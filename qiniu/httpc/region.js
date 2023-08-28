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
 * @param {Date} [options.coolDownBefore]
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
    this.coolDownBefore = options.coolDownBefore || new Date(0);
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

    let regionId = options.regionId;
    if (!regionId) {
        regionId = (() => {
            // This `regionId` determine method is inspected by the constructor of `Zone`
            const firstDotIndex = zone.ioHost.indexOf('.');
            if (firstDotIndex < 0) {
                return;
            }
            const firstDashIndex = zone.ioHost.substring(0, firstDotIndex).indexOf('-');
            if (firstDashIndex < 0) {
                return;
            }
            return zone.ioHost.substring(firstDashIndex + 1, firstDotIndex);
        })();
    }

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
        regionId: regionId,
        s3RegionId: options.s3RegionId || regionId,
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
                // TODO: source upload domain as alternate?
                new Endpoint('up.qiniup.com')
            ]
            : [
                new Endpoint('upload-' + regionId + '.qiniup.com'),
                // TODO: source upload domain as alternate?
                new Endpoint('up-' + regionId + '.qiniup.com')
            ],
        // TODO: add alternative domains for below services
        [SERVICE_NAME.IO]: isZ0
            ? [
                new Endpoint('iovip.qiniuio.com')
            ]
            : [
                new Endpoint('iovip-' + regionId + '.qiniuio.com')
            ],
        [SERVICE_NAME.RS]: [
            new Endpoint('rs-' + regionId + '.qiniuapi.com')
        ],
        [SERVICE_NAME.RSF]: [
            new Endpoint('rsf-' + regionId + '.qiniuapi.com')
        ],
        [SERVICE_NAME.API]: [
            new Endpoint('api.qiniuapi.com')
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

/**
 * @typedef RegionPersistInfo
 * @property {string} [regionId]
 * @property {string} s3RegionId
 * @property {Object.<string, EndpointPersistInfo[]>} services
 * @property {number} ttl
 * @property {number} createTime
 * @property {number} coolDownBefore
 */

/**
 * @param {RegionPersistInfo} persistInfo
 * @returns {Region}
 */
Region.fromPersistInfo = function (persistInfo) {
    /**
     * @param {EndpointPersistInfo[]} servicePersistEndpoint
     * @returns {Endpoint[]}
     */
    const convertToEndpoints = (servicePersistEndpoint) => {
        // The `persistInfo` is from disk that may be broken.
        if (!Array.isArray(servicePersistEndpoint)) {
            return [];
        }

        return servicePersistEndpoint.map(e => Endpoint.fromPersistInfo(e));
    };

    /**
     * @type {Object.<ServiceKey, Endpoint[]>}
     */
    const services = {};
    for (const serviceName of Object.keys(persistInfo.services)) {
        const endpointPersistInfos = persistInfo.services[serviceName];
        services[serviceName] = convertToEndpoints(endpointPersistInfos);
    }

    return new Region({
        regionId: persistInfo.regionId,
        s3RegionId: persistInfo.s3RegionId,
        services: services,
        ttl: persistInfo.ttl,
        createTime: new Date(persistInfo.createTime),
        coolDownBefore: new Date(persistInfo.coolDownBefore)
    });
};

/**
 * @param {Object} data
 * @param {string} data.region
 * @param {Object} data.s3
 * @param {string[]} data.s3.domains
 * @param {string} data.s3.region_alias
 * @param {Object} data.uc
 * @param {string[]} data.uc.domains
 * @param {Object} data.up
 * @param {string[]} data.up.domains
 * @param {Object} data.io
 * @param {string[]} data.io.domains
 * @param {Object} data.rs
 * @param {string[]} data.rs.domains
 * @param {Object} data.rsf
 * @param {string[]} data.rsf.domains
 * @param {Object} data.api
 * @param {string[]} data.api.domains
 * @param {number} data.ttl
 * @returns {Region}
 */
Region.fromQueryData = function (data) {
    /**
     * @param {string[]} domains
     * @returns {Endpoint[]}
     */
    const convertToEndpoints = (domains) => {
        if (!Array.isArray(domains)) {
            return [];
        }
        return domains.map(d => new Endpoint(d));
    };

    let services = {
        [SERVICE_NAME.UC]: convertToEndpoints(data.uc.domains),
        [SERVICE_NAME.UP]: convertToEndpoints(data.up.domains),
        [SERVICE_NAME.IO]: convertToEndpoints(data.io.domains),
        [SERVICE_NAME.RS]: convertToEndpoints(data.rs.domains),
        [SERVICE_NAME.RSF]: convertToEndpoints(data.rsf.domains),
        [SERVICE_NAME.API]: convertToEndpoints(data.api.domains),
        [SERVICE_NAME.S3]: convertToEndpoints(data.s3.domains)
    };

    // forward compatibility with new services
    services = Object.keys(data)
        // use Object.entries when min version of Node.js update to ≥ v7.5.0
        .map(k => ([k, data[k]]))
        .reduce((s, [k, v]) => {
            if (v && Array.isArray(v.domains) && !(k in s)) {
                s[k] = convertToEndpoints(v.domains);
            }
            return s;
        }, services);

    return new Region({
        regionId: data.region,
        s3RegionId: data.s3.region_alias,
        services: services,
        ttl: data.ttl,
        createTime: new Date()
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

Object.defineProperty(Region.prototype, 'persistInfo', {
    /**
     * @returns {RegionPersistInfo}
     */
    get: function () {
        /**
         * @type {Object.<string, EndpointPersistInfo[]>}
         */
        const persistedServices = {};
        // use Object.entries when min version of Node.js update to ≥ v7.5.0
        for (const k of Object.keys(this.services)) {
            const v = this.services[k];
            persistedServices[k] = v.map(endpoint => endpoint.persistInfo);
        }

        return {
            regionId: this.regionId,
            s3RegionId: this.s3RegionId,
            services: persistedServices,
            ttl: this.ttl,
            createTime: this.createTime.getTime(),
            coolDownBefore: this.coolDownBefore.getTime()
        };
    },
    enumerable: false,
    configurable: true
});

exports.SERVICE_NAME = SERVICE_NAME;
exports.Region = Region;
