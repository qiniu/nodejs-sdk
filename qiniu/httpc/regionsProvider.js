const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const stream = require('stream');

const { Region } = require('./region');

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
const CachedRegionsProvider = (function () {
    /**
     * cache regions in memory.
     * @private DO NOT export this.
     * @type {Map<string, Region[]>}
     */
    const memoCachedRegions = new Map();
    const lastShrinkAt = new Date();

    /**
     * @class
     * @implements RegionsProvider
     * @param {Object} [options]
     * @param {string} options.cacheKey
     * @param {RegionsProvider} options.baseRegionsProvider
     * @param {number} [options.shrinkInterval]
     * @param {string} [options.persistPath]
     * @constructor
     */
    function CachedRegionsProvider (
        options
    ) {
        // only used for testing
        this._memoCache = memoCachedRegions;

        this.cacheKey = options.cacheKey;
        this.baseRegionsProvider = options.baseRegionsProvider;

        this.lastShrinkAt = lastShrinkAt;
        this.shrinkInterval = options.shrinkInterval || 86400 * 1000;
        this.persistPath = options.persistPath;
        // allow disable persist
        if (!this.persistPath && this.persistPath !== null) {
            this.persistPath = path.join(os.tmpdir(), 'qn-regions-cache.jsonl');
        }
    }

    /**
     * the returns value means if shrunk or not.
     * @param {boolean} [force]
     * @returns {Promise<boolean>}
     */
    CachedRegionsProvider.prototype.shrink = function (force) {
        const now = new Date();
        const shouldShrink = force || this.lastShrinkAt.getTime() + this.shrinkInterval < now.getTime();
        if (!shouldShrink) {
            return Promise.resolve(false);
        }
        this.lastShrinkAt = now;

        // shrink memory cache
        for (const [key, regions] of this._memoCache.entries()) {
            const liveRegions = regions.filter(r => r.isLive);
            if (liveRegions.length) {
                this._memoCache.set(key, liveRegions);
            } else {
                this._memoCache.delete(key);
            }
        }

        if (!this.persistPath) {
            return Promise.resolve(true);
        }
        // shrink file cache
        const shrunkCache = new Map();
        const shrinkPath = this.persistPath + '.shrink';
        const lockPath = this.persistPath + '.shrink.lock';
        const unlockShrink = () => {
            try {
                fs.unlinkSync(lockPath);
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    console.error(err);
                }
            }
        };
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
            // prevent deadlock if exit unexpectedly when shrinking
            process.on('exit', unlockShrink);
        })
            .then(() => {
                // parse useless data
                return walkFileCache.call(this, ({
                    cacheKey,
                    regions
                }) => {
                    const validRegions = regions.filter(r => r.isLive);
                    if (!validRegions.length) {
                        return;
                    }

                    if (!shrunkCache.has(cacheKey)) {
                        shrunkCache.set(cacheKey, validRegions);
                        return;
                    }

                    const shrunkRegions = shrunkCache.get(cacheKey);
                    shrunkCache.set(
                        cacheKey,
                        mergeRegions(shrunkRegions, validRegions)
                    );
                });
            })
            .then(() => {
                // write to file
                const shrunkCacheIterator = shrunkCache.entries();
                const cacheReadStream = new stream.Readable({
                    read: function () {
                        const nextEntry = shrunkCacheIterator.next();
                        if (nextEntry.done) {
                            this.push(null);
                        } else {
                            const [cacheKey, regions] = nextEntry.value;
                            this.push(
                                stringifyPersistedRegions(
                                    cacheKey,
                                    regions
                                ) + os.EOL
                            );
                        }
                    }
                });
                const writeStream = fs.createWriteStream(shrinkPath);
                return new Promise((resolve, reject) => {
                    const pipeline = cacheReadStream.pipe(writeStream);
                    pipeline.on('close', resolve);
                    pipeline.on('error', reject);
                });
            })
            .then(() => {
                return new Promise(resolve => {
                    fs.rename(shrinkPath, this.persistPath, () => resolve());
                });
            })
            .then(() => {
                unlockShrink();
                process.removeListener('exit', unlockShrink);
                return Promise.resolve(true);
            })
            .catch(err => {
                // if exist
                if (err.code === 'EEXIST' && err.path === lockPath) {
                    // ignore file shrinking err
                    return Promise.resolve(false);
                }
                // use finally when min version of Node.js update to ≥ v10.3.0
                unlockShrink();
                process.removeListener('exit', unlockShrink);
                return Promise.reject(err);
            });
    };

    /**
     * @returns {Promise<Region[]>}
     */
    CachedRegionsProvider.prototype.getRegions = function () {
        /** @type Region[] */
        return this.shrink()
            .then(() => {
                const getRegionsFns = [
                    getRegionsFromMemo,
                    getRegionsFromFile,
                    getRegionsFromBaseProvider
                ];

                return getRegionsFns.reduce((promiseChain, getRegionsFn) => {
                    return promiseChain.then(regions => {
                        if (regions.length) {
                            return regions;
                        }
                        return getRegionsFn.call(this);
                    });
                }, Promise.resolve([]));
            });
    };

    /**
     * @param {Region[]} regions
     * @returns {Promise<void>}
     */
    CachedRegionsProvider.prototype.setRegions = function (regions) {
        this._memoCache.set(this.cacheKey, regions);
        if (!this.persistPath) {
            return Promise.resolve();
        }
        return new Promise(resolve => {
            fs.appendFile(
                this.persistPath,
                stringifyPersistedRegions(
                    this.cacheKey,
                    regions
                ) + os.EOL,
                err => {
                    if (err) {
                        resolve();
                        return;
                    }
                    resolve();
                }
            );
        });
    };

    /**
     * @private
     * @returns {Promise<Region[]>}
     */
    function getRegionsFromMemo () {
        const regions = this._memoCache.get(this.cacheKey);

        if (Array.isArray(regions) && regions.length) {
            return Promise.resolve(regions);
        }

        return Promise.resolve([]);
    }

    /**
     * @returns {Promise<Region[]>}
     */
    function getRegionsFromFile () {
        if (!this.persistPath) {
            return Promise.resolve([]);
        }

        return flushFileCacheToMemo.call(this)
            .then(() => {
                return getRegionsFromMemo.call(this);
            })
            .catch(() => {
                return Promise.resolve([]);
            });
    }

    /**
     * @returns {Promise<Region[]>}
     */
    function getRegionsFromBaseProvider () {
        return this.baseRegionsProvider.getRegions()
            .then(regions => {
                if (regions.length) {
                    return this.setRegions(regions);
                }
                return Promise.resolve();
            })
            .then(() => {
                return getRegionsFromMemo.call(this);
            });
    }

    /**
     * @private
     * @param {function(CachedPersistedRegions):void} fn
     * @param {Object} [options]
     * @param {boolean} [options.ignoreParseError]
     * @return {Promise<void>}
     */
    function walkFileCache (fn, options) {
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
                        const cachedPersistedRegions = parsePersistedRegions(line);
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
    }

    /**
     * @private
     * @returns Promise<void>
     */
    function flushFileCacheToMemo () {
        return walkFileCache.call(this, ({
            cacheKey,
            regions
        }) => {
            const validRegions = regions.filter(r => r.isLive);
            if (!validRegions.length) {
                return;
            }

            if (!this._memoCache.has(cacheKey)) {
                this._memoCache.set(cacheKey, validRegions);
                return;
            }

            const memoRegions = this._memoCache.get(cacheKey);
            this._memoCache.set(
                cacheKey,
                mergeRegions(memoRegions, validRegions)
            );
        });
    }

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
    function parsePersistedRegions (persistedRegions) {
        const { cacheKey, regions } = JSON.parse(persistedRegions);
        return {
            cacheKey,
            regions: regions.map(r => Region.fromPersistInfo(r))
        };
    }

    /**
     * @private
     * @param {string} cacheKey
     * @param {Region[]} regions
     * @return {string}
     */
    function stringifyPersistedRegions (cacheKey, regions) {
        return JSON.stringify({
            cacheKey,
            regions: regions.map(r => r.persistInfo)
        });
    }

    /**
     * merge two regions by region id.
     * if the same region id, the last create region will be keep.
     * @param {Region[]} regionsA
     * @param {Region[]} regionsB
     * @returns {Region[]}
     */
    function mergeRegions (regionsA, regionsB) {
        if (!regionsA.length) {
            return regionsB;
        }
        if (!regionsB.length) {
            return regionsA;
        }

        const convertRegionsToMap = (regions) => regions.reduce((m, r) => {
            if (
                m[r.regionId] &&
                m[r.regionId].createTime > r.createTime
            ) {
                return m;
            }
            m[r.regionId] = r;
            return m;
        }, {});

        const regionsMapA = convertRegionsToMap(regionsA);
        const regionsMapB = convertRegionsToMap(regionsB);

        // union region ids
        const regionIds = new Set();
        Object.keys(regionsMapA).forEach(rid => regionIds.add(rid));
        Object.keys(regionsMapB).forEach(rid => regionIds.add(rid));

        // merge
        const result = [];
        for (const regionId of regionIds) {
            if (regionsMapA[regionId] && regionsMapB[regionId]) {
                if (regionsMapA[regionId].createTime > regionsMapB[regionId].createTime) {
                    result.push(regionsMapA[regionId]);
                } else {
                    result.push(regionsMapB[regionId]);
                }
            } else {
                if (regionsMapA[regionId]) {
                    result.push(regionsMapA[regionId]);
                } else if (regionsMapB[regionId]) {
                    result.push(regionsMapB[regionId]);
                }
            }
        }
        return result;
    }

    return CachedRegionsProvider;
})();
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

/**
 * @param _regions
 * @returns {Promise<void>}
 */
QueryRegionsProvider.prototype.setRegions = function (_regions) {
    return Promise.reject(new Error('QueryRegionsProvider not support setRegions'));
};

exports.StaticRegionsProvider = StaticRegionsProvider;
exports.CachedRegionsProvider = CachedRegionsProvider;
exports.QueryRegionsProvider = QueryRegionsProvider;
