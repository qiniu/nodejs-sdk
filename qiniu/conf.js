const os = require('os');
const pkg = require('../package.json');
const { Endpoint } = require('./httpc/endpoint');
const { Region } = require('./httpc/region');
const { StaticEndpointsProvider } = require('./httpc/endpointsProvider');
const crypto = require('crypto');
const {
    CachedRegionsProvider,
    QueryRegionsProvider
} = require('./httpc/regionsProvider');

exports.ACCESS_KEY = '<PLEASE APPLY YOUR ACCESS KEY>';
exports.SECRET_KEY = '<DONT SEND YOUR SECRET KEY TO ANYONE>';

const defaultUserAgent = function () {
    return 'QiniuNodejs/' + pkg.version + ' (' + os.type() + '; ' + os.platform() +
        '; ' + os.arch() + '; )';
};

exports.USER_AGENT = defaultUserAgent();
exports.BLOCK_SIZE = 4 * 1024 * 1024; // 4MB, never change

// define api form mime type
exports.FormMimeUrl = 'application/x-www-form-urlencoded';
exports.FormMimeJson = 'application/json';
exports.FormMimeRaw = 'application/octet-stream';
exports.RS_HOST = 'rs.qiniu.com';
exports.RPC_TIMEOUT = 600000; // 600s
let QUERY_REGION_BACKUP_HOSTS = [
    'uc.qbox.me',
    'api.qiniu.com'
];
Object.defineProperty(exports, 'QUERY_REGION_BACKUP_HOSTS', {
    get: () => QUERY_REGION_BACKUP_HOSTS,
    set: v => {
        QUERY_REGION_BACKUP_HOSTS = v;
    }
});
let QUERY_REGION_HOST = 'kodo-config.qiniuapi.com';
Object.defineProperty(exports, 'QUERY_REGION_HOST', {
    get: () => QUERY_REGION_HOST,
    set: v => {
        QUERY_REGION_HOST = v;
        QUERY_REGION_BACKUP_HOSTS = [];
    }
});
let UC_HOST = 'uc.qbox.me';
Object.defineProperty(exports, 'UC_HOST', {
    get: () => UC_HOST,
    set: v => {
        UC_HOST = v;
        QUERY_REGION_HOST = v;
        QUERY_REGION_BACKUP_HOSTS = [];
    }
});

// proxy
exports.RPC_HTTP_AGENT = null;
exports.RPC_HTTPS_AGENT = null;

/**
 * @class
 * @constructor
 * @param {Object} [options]
 * @param {boolean} [options.useHttpsDomain]
 * @param {boolean} [options.useCdnDomain]
 * @param {EndpointsProvider} [options.ucEndpointsProvider]
 * @param {EndpointsProvider} [options.queryRegionsEndpointsProvider]
 * @param {RegionsProvider} [options.regionsProvider]
 * @param {Zone} [options.zone]
 * @param {number} [options.zoneExpire]
 */
function Config (options) {
    options = options || {};
    // use http or https protocol
    this.useHttpsDomain = !!(options.useHttpsDomain || false);
    // use cdn accelerated domains, this is not work with auto query region
    this.useCdnDomain = !!(options.useCdnDomain && true);
    // custom uc endpoints
    this.ucEndpointsProvider = options.ucEndpointsProvider || null;
    // custom query region endpoints
    this.queryRegionsEndpointsProvider = options.queryRegionsEndpointsProvider || null;
    // custom regions
    this.regionsProvider = options.regionsProvider || null;

    // deprecated
    // zone of the bucket
    this.zone = options.zone || null;
    this.zoneExpire = options.zoneExpire || -1;
}

/**
 * @returns {EndpointsProvider}
 */
Config.prototype.getUcEndpointsProvider = function () {
    if (this.ucEndpointsProvider) {
        return this.ucEndpointsProvider;
    }

    return new Endpoint(
        UC_HOST,
        {
            defaultScheme: this.useHttpsDomain ? 'https' : 'http'
        }
    );
};

/**
 * @private
 * @returns {EndpointsProvider}
 */
Config.prototype._getQueryRegionEndpointsProvider = function () {
    if (this.queryRegionsEndpointsProvider) {
        return this.queryRegionsEndpointsProvider;
    }

    if (this.ucEndpointsProvider) {
        return this.ucEndpointsProvider;
    }

    const queryRegionsHosts = [QUERY_REGION_HOST].concat(QUERY_REGION_BACKUP_HOSTS);
    return new StaticEndpointsProvider(queryRegionsHosts.map(h =>
        new Endpoint(
            h,
            {
                defaultScheme: this.useHttpsDomain ? 'https' : 'http'
            }
        )
    ));
};

/**
 * @param {Object} [options]
 * @param {string} [options.bucketName]
 * @param {string} [options.accessKey]
 * @returns {Promise<RegionsProvider>}
 */
Config.prototype.getRegionsProvider = function (options) {
    // returns custom regions provider, if it's configured
    if (this.regionsProvider) {
        return Promise.resolve(this.regionsProvider);
    }

    // backward compatibility with custom zone configuration
    const zoneProvider = this._getRegionsProviderFromZone();
    if (zoneProvider) {
        return Promise.resolve(zoneProvider);
    }

    // get default regions provider
    const {
        bucketName,
        accessKey
    } = options || {};
    if (!bucketName || !accessKey) {
        return Promise.reject(
            new Error('bucketName and accessKey is required for query regions')
        );
    }
    return this._getDefaultRegionsProvider({
        bucketName,
        accessKey
    });
};

/**
 * @private
 * @returns {RegionsProvider | undefined}
 */
Config.prototype._getRegionsProviderFromZone = function () {
    let zoneTTL;
    let shouldUseZone;
    if (this.zoneExpire > 0) {
        zoneTTL = this.zoneExpire - Math.trunc(Date.now() / 1000);
        shouldUseZone = this.zone && zoneTTL > 0;
    } else {
        zoneTTL = -1;
        shouldUseZone = Boolean(this.zone);
    }
    if (!shouldUseZone) {
        return;
    }
    return Region.fromZone(this.zone, {
        ttl: zoneTTL,
        isPreferCdnHost: this.useCdnDomain,
        preferredScheme: this.useHttpsDomain ? 'https' : 'http'
    });
};

/**
 * @private
 * @param {Object} options
 * @param {string} options.bucketName
 * @param {string} options.accessKey
 * @returns {Promise<RegionsProvider>}
 */
Config.prototype._getDefaultRegionsProvider = function (options) {
    const {
        bucketName,
        accessKey
    } = options;

    const queryRegionsEndpointsProvider = this._getQueryRegionEndpointsProvider();
    return queryRegionsEndpointsProvider
        .getEndpoints()
        .then(endpoints => {
            const endpointsMd5 = endpoints
                .map(e => e.host)
                .sort()
                .reduce(
                    (hash, host) => hash.update(host),
                    crypto.createHash('md5')
                )
                .digest('hex');
            const cacheKey = [
                endpointsMd5,
                accessKey,
                bucketName
            ].join(':');
            return new CachedRegionsProvider({
                cacheKey,
                baseRegionsProvider: new QueryRegionsProvider({
                    accessKey: accessKey,
                    bucketName: bucketName,
                    endpointsProvider: queryRegionsEndpointsProvider,
                    preferredScheme: this.useHttpsDomain ? 'https' : 'http'
                })
            });
        });
};

exports.Config = Config;
/**
 * backward compatibility
 * @deprecated use qiniu/httpc/region.js instead
 */
exports.Zone = require('./zone').Zone;
