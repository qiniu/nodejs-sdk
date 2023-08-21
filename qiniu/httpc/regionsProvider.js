const fs = require('fs');
const readline = require('readline');
const os = require('os');

const { Region } = require('./region');

/**
 * @interface Shrink
 * @property {Date} lastShrinkAt
 * @property {number} shrinkInterval
 */

/**
 * @function
 * @name Shrink#shrink
 * @param {boolean} [force]
 * @returns {Promise<boolean>}
 */

/**
 * @typedef {Object} ShrinkOptions
 * @property {Date} [lastShrinkAt]
 * @property {number} [shrinkInterval]
 */

// --- could split to files if migrate to typescript --- //

/**
 * @interface RegionsProvider
 */

/**
 * @function
 * @name RegionsProvider#getRegions
 * @returns {Promise<Region[]>}
 */

/**
 * @function
 * @name RegionsProvider#setRegions
 * @param {Region[]} regions
 * @returns {Promise<void>}
 */

// --- could split to files if migrate to typescript --- //

/**
 * NOTE: This Regions Provider will ignore the ttl in Region.
 *
 * @class
 * @implements RegionsProvider
 * @param {Region[]} regions
 * @constructor
 */
function StaticRegionsProvider (regions) {
    this.regions = regions;
}

StaticRegionsProvider.prototype.getRegions = function () {
    return Promise.resolve(this.regions);
};

StaticRegionsProvider.prototype.setRegions = function (regions) {
    this.regions = regions;
    return Promise.resolve();
};

// --- could split to files if migrate to typescript --- //
/**
 * cache regions in memory.
 * @private DO NOT export this.
 * @type {Map<string, Region[]>}
 */
let memoCachedRegions = new Map();

/**
 * @typedef {Object} CachedRegionsProviderOptionsType
 * @property {string} [persistPath]
 *
 * use `extends ShrinkOptions` if migrate to typescript
 * @typedef {ShrinkOptions & CachedRegionsProviderOptionsType} CachedRegionsProviderOptions
 */

/**
 * @class
 * @implements RegionsProvider
 * @implements Shrink
 * @param {string} cacheKey
 * @param {CachedRegionsProviderOptions} [options]
 * @constructor
 */
function CachedRegionsProvider (
    cacheKey,
    options
) {
    this.cacheKey = cacheKey;

    this.lastShrinkAt = options.lastShrinkAt || new Date(0);
    this.shrinkInterval = options.shrinkInterval || 86400;
    this.persistPath = options.persistPath;
}

CachedRegionsProvider.prototype.shrink = function (force) {
    const shouldShrink = force || this.lastShrinkAt.getTime() + this.shrinkInterval < Date.now();
    if (!shouldShrink) {
        return Promise.resolve(false);
    }

    // shrink memory cache
    /** @type {Map<string, Region[]>} */
    const cache = new Map();
    for (const [key, regions] of memoCachedRegions.entries()) {
        const liveRegions = regions.filter(r => r.isLive);
        if (liveRegions.length) {
            cache.set(key, liveRegions);
        }
    }
    memoCachedRegions = cache;

    // shrink file cache
    const shrunkCache = new Map();
    const shrinkPath = this.persistPath + '.shrink';
    const lockPath = this.persistPath + '.shrink.lock';
    return new Promise((resolve, reject) => {
        // lock to shrink
        fs.open(lockPath, 'wx', (err, fd) => {
            if (err) {
                reject(err);
                return;
            }
            fs.closeSync(fd);
            resolve();
        });
    })
        .then(() => {
            // parse useless data
            return this.walkFileCache(({ cacheKey, regions }) => {
                const validRegions = regions.filter(r => r.isLive);
                if (validRegions.length) {
                    shrunkCache.set(cacheKey, validRegions);
                }
            });
        })
        .then(() => {
            // write and close
            const writeStream = fs.createWriteStream(shrinkPath);
            for (const [cacheKey, regions] of shrunkCache.entries()) {
                writeStream.write(
                    CachedRegionsProvider.stringifyPersistedRegions(
                        cacheKey,
                        regions
                    ) + os.EOL,
                    'utf-8'
                );
            }
            writeStream.close();
        })
        .then(() => {
            return new Promise(resolve => {
                fs.rename(shrinkPath, this.persistPath, () => resolve());
            });
        })
        .then(() => {
            fs.unlink(lockPath, () => {});
        })
        .catch(err => {
            // if exist
            if (err.code === 'EEXIST' && err.path === lockPath) {
                // ignore file shrinking err
                return Promise.resolve(true);
            }
            // use finally when min version of Node.js update to ≥ v10.3.0
            fs.unlink(lockPath, () => {});
            return Promise.reject(err);
        });
};

CachedRegionsProvider.prototype.getRegions = function () {
    /** @type Region[] */
    this.shrink();

    // read from memo
    const regions = this.getRegionsFromMemo();
    if (regions.length) {
        return Promise.resolve(regions);
    }

    // read from file
    if (!this.persistPath) {
        return Promise.resolve([]);
    }

    return this.flushFileCacheToMemo()
        .then(() => {
            return this.getRegionsFromMemo();
        })
        .catch(() => {
            return Promise.resolve([]);
        });
};

CachedRegionsProvider.prototype.setRegions = function (regions) {
    memoCachedRegions.set(this.cacheKey, regions);
    return new Promise((resolve, reject) => {
        fs.appendFile(
            this.persistPath,
            CachedRegionsProvider.stringifyPersistedRegions(
                this.cacheKey,
                regions
            ) + os.EOL,
            err => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            }
        );
    });
};

/**
 * @private
 * @returns {Region[]}
 */
CachedRegionsProvider.prototype.getRegionsFromMemo = function () {
    const regions = memoCachedRegions.get(this.cacheKey);

    if (Array.isArray(regions) && regions.length) {
        // TODO: or filter r => r.coolDownBefore < new Date()?
        regions.sort((r1, r2) => r1.coolDownBefore - r2.coolDownBefore);
        return regions;
    }

    return [];
};

/**
 * @private
 * @param {function(CachedPersistedRegions):void} fn
 * @param {Object} [options]
 * @param {boolean} [options.ignoreParseError]
 * @return {Promise<void>}
 */
CachedRegionsProvider.prototype.walkFileCache = function (fn, options) {
    options = options || {};
    options.ignoreParseError = options.ignoreParseError || false;
    if (!fs.existsSync(this.persistPath)) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const rl = readline.createInterface({
            input: fs.createReadStream(this.persistPath)
        });

        rl
            .on('line', (line) => {
                try {
                    const cachedPersistedRegions =
                        CachedRegionsProvider.parsePersistedRegions(line);
                    fn(cachedPersistedRegions);
                } catch (err) {
                    if (!options.ignoreParseError) {
                        rl.close();
                        reject(err);
                    }
                }
            })
            .on('close', () => {
                resolve();
            });
    });
};

/**
 * @private
 */
CachedRegionsProvider.prototype.flushFileCacheToMemo = function () {
    return this.walkFileCache(({ cacheKey, regions }) => {
        // TODO: flush all cache from file to memo, should it?
        memoCachedRegions.set(cacheKey, regions);
    });
};

/**
 * @typedef CachedPersistedRegions
 * @property {string} cacheKey
 * @property {Region[]} regions
 */

/**
 * @private
 * @param {string} persistedRegions
 * @return {CachedPersistedRegions}
 */
CachedRegionsProvider.parsePersistedRegions = function (persistedRegions) {
    const { cacheKey, regions } = JSON.parse(persistedRegions);
    return {
        cacheKey,
        regions: regions.map(r => Region.fromPersistInfo(r))
    };
};

/**
 * @private
 * @param {string} cacheKey
 * @param {Region[]} regions
 * @return {string}
 */
CachedRegionsProvider.stringifyPersistedRegions = function (cacheKey, regions) {
    return JSON.stringify({
        cacheKey,
        regions: regions.map(r => r.persistInfo)
    });
};

// --- could split to files if migrate to typescript --- //
const { RetryDomainsMiddleware } = require('../httpc/middleware');
const rpc = require('../rpc');

/**
 * @class
 * @implements RegionsProvider
 * @param {Object} options
 * @param {string} options.accessKey
 * @param {string} options.bucketName
 * @param {EndpointsProvider} options.endpointsProvider
 * @constructor
 */
function QueryRegionsProvider (options) {
    this.accessKey = options.accessKey;
    this.bucketName = options.bucketName;
    this.endpintsProvider = options.endpointsProvider;
}

/**
 * @return {Promise<Endpoint[]>}
 */
QueryRegionsProvider.prototype.getRegions = function () {
    return this.endpintsProvider.getEndpoints()
        .then(endpoints => {
            const [preferredEndpoint, ...alternativeEndpoints] = endpoints;

            if (!preferredEndpoint) {
                return Promise.reject(new Error('There isn\'t available endpoints to query regions'));
            }

            const middlewares = [];
            if (alternativeEndpoints.length) {
                middlewares.push(
                    new RetryDomainsMiddleware({
                        backupDomains: alternativeEndpoints.map(e => e.host)
                    })
                );
            }

            const url = preferredEndpoint.getValue() + '/v4/query';

            // send request;
            return rpc.qnHttpClient.get({
                url: url,
                params: {
                    ak: this.accessKey,
                    bucket: this.bucketName
                },
                middlewares: middlewares
            });
        })
        .then(respWrapper => {
            if (!respWrapper.ok()) {
                return Promise.reject(
                    new Error('Query regions failed with HTTP Status Code' + respWrapper.resp.statusCode)
                );
            }
            try {
                const hosts = JSON.parse(respWrapper.data).hosts;
                return hosts.map(r => Region.fromQueryData(r));
            } catch (err) {
                return Promise.reject(
                    new Error('There isn\'t available hosts in query result', {
                        cause: err
                    })
                );
            }
        });
};

QueryRegionsProvider.prototype.setRegions = function (_regions) {
    return Promise.reject(new Error('QueryRegionsProvider not support setRegions'));
};

// --- could split to files if migrate to typescript --- //

/**
 * @class
 * @implements RegionsProvider
 * @constructor
 * @param {RegionsProvider[]} providers
 */
function ChainedRegionsProvider (providers) {
    this.providers = providers;
}

ChainedRegionsProvider.prototype.getRegions = function () {
    let [currentProvider, ...alternativeProviders] = this.providers;

    if (!currentProvider) {
        return Promise.reject(new Error('There isn\'t available provider to get regions'));
    }

    const tryGetRegions = () => {
        return currentProvider.getRegions()
            .then(regions => {
                if (!regions.length && alternativeProviders.length) {
                    currentProvider = alternativeProviders.shift();
                    return tryGetRegions();
                }
                return regions;
            })
            .catch(err => {
                if (alternativeProviders.length) {
                    currentProvider = alternativeProviders.shift();
                    return tryGetRegions();
                }

                return Promise.reject(err);
            });
    };

    return tryGetRegions()
        .then(regions => {
            // `+1` to exclude `currentProvider`
            const endIndex = this.providers.length - alternativeProviders.length + 1;
            const providersToFresh = this.providers.slice(0, endIndex);
            for (const p of providersToFresh) {
                p.setRegions(regions)
                    .catch(() => {
                        // ignore set error, because of cache usage
                    });
            }

            return regions;
        });
};

ChainedRegionsProvider.prototype.setRegions = function (_regions) {
    return Promise.reject(new Error('ChainedRegionsProvider not support setRegions'));
};

exports.StaticRegionsProvider = StaticRegionsProvider;
exports.CachedRegionsProvider = CachedRegionsProvider;
exports.QueryRegionsProvider = QueryRegionsProvider;
exports.ChainedRegionsProvider = ChainedRegionsProvider;
