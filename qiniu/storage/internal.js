// internal
// DO NOT use this file, unless you know what you're doing.
// Because its API may make broken change for internal usage.

const conf = require('../conf');
const fs = require('fs');

const {
    Region, SERVICE_NAME
} = require('../httpc/region');
const {
    CachedRegionsProvider,
    QueryRegionsProvider,
    StaticRegionsProvider
} = require('../httpc/regionsProvider');
const {
    Endpoint
} = require('../httpc/endpoint');
const {
    StaticEndpointsProvider
} = require('../httpc/endpointsProvider');
const { ResponseWrapper } = require('../httpc/responseWrapper');
const crypto = require('crypto');

exports.prepareRegionsProvider = prepareRegionsProvider;
exports.doWorkWithRetry = doWorkWithRetry;
exports.ChangeEndpointRetryPolicy = ChangeEndpointRetryPolicy;
exports.ChangeRegionRetryPolicy = ChangeRegionRetryPolicy;
exports.TokenExpiredRetryPolicy = TokenExpiredRetryPolicy;

/**
 * @param {string} [defaultScheme]
 * @returns {StaticEndpointsProvider}
 */
function getDefaultQueryRegionEndpointsProvider (defaultScheme) {
    defaultScheme = defaultScheme || 'https';

    /**
     * @type {string[]}
     */
    const queryRegionHosts = [conf.QUERY_REGION_HOST].concat(conf.QUERY_REGION_BACKUP_HOSTS);

    return new StaticEndpointsProvider(queryRegionHosts.map(h => new Endpoint(h, { defaultScheme })));
}

/**
 * @param {Object} options
 * @param {string} options.accessKey
 * @param {string} options.bucketName
 * @param {EndpointsProvider} [options.queryRegionsEndpointProvider]
 * @param {string} [options.defaultScheme]
 * @returns {Promise<CachedRegionsProvider>}
 */
function getDefaultRegionsProvider (options) {
    let queryRegionsEndpointProvider = options.queryRegionsEndpointProvider;
    if (!queryRegionsEndpointProvider) {
        queryRegionsEndpointProvider = getDefaultQueryRegionEndpointsProvider(options.defaultScheme);
    }

    return queryRegionsEndpointProvider.getEndpoints()
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
                options.accessKey,
                options.bucketName
            ].join(':');
            return new CachedRegionsProvider({
                cacheKey,
                baseRegionsProvider: new QueryRegionsProvider({
                    accessKey: options.accessKey,
                    bucketName: options.bucketName,
                    endpointsProvider: new StaticEndpointsProvider(endpoints)
                })
            });
        });
}

/**
 * @param {Object} options
 * @param {conf.Config} options.config
 * @param {string} options.bucketName
 * @param {string} options.accessKey
 * @returns {Promise<RegionsProvider>}
 */
function prepareRegionsProvider (options) {
    const {
        config,
        bucketName,
        accessKey
    } = options;

    // prepare RegionsProvider
    let regionsProvider = config.regionsProvider;
    if (regionsProvider) {
        return Promise.resolve(regionsProvider);
    }

    // backward compatibility with zone
    let zoneTtl;
    let shouldUseZone;
    if (config.zoneExpire > 0) {
        zoneTtl = config.zoneExpire - Math.trunc(Date.now() / 1000);
        shouldUseZone = config.zone && zoneTtl > 0;
    } else {
        zoneTtl = -1;
        shouldUseZone = Boolean(config.zone);
    }
    if (shouldUseZone) {
        regionsProvider = new StaticRegionsProvider([
            Region.fromZone(config.zone, {
                ttl: zoneTtl,
                isPreferCdnHost: config.useCdnDomain
            })
        ]);
    }
    if (regionsProvider) {
        return Promise.resolve(regionsProvider);
    }

    return getDefaultRegionsProvider({
        accessKey,
        bucketName,
        defaultScheme: config.useHttpsDomain ? 'https' : 'http'
    });
}

// --- split to files --- //

/**
 * @interface RetryPolicy
 */

/**
 * should have an options arguments for receiving work params like ReqOptions to initial context
 * @function
 * @name RetryPolicy#initContext
 * @param {Object} context
 * @returns {Promise<void>}
 */

/**
 * @typedef RetryRet
 * @property {any} data
 * @property {IncomingMessage} resp
 */

/**
 * @function
 * @name RetryPolicy#prepareRetry
 * @param {Object} context
 * @param {RetryRet} ret
 * @returns {Promise<boolean>}
 */

// --- split to files --- //

/**
 * @class
 * @constructor
 * @implements RetryPolicy
 * @param {Object} [options]
 * @param {number} [options.maxRetryTimes]
 */
function TokenExpiredRetryPolicy (options) {
    options = options || {};
    this.id = Symbol(this.constructor.name);
    this.maxRetryTimes = options.maxRetryTimes || 1;
}

/**
 * @param {string} resumeRecordFilePath
 * @returns {boolean}
 */
TokenExpiredRetryPolicy.prototype.isResumedUpload = function (resumeRecordFilePath) {
    if (!resumeRecordFilePath) {
        return false;
    }
    return fs.existsSync(resumeRecordFilePath);
};

/**
 * @param {Object} context
 * @returns {Promise<void>}
 */
TokenExpiredRetryPolicy.prototype.initContext = function (context) {
    context[this.id] = {
        retriedTimes: 0
    };
    return Promise.resolve();
};

/**
 * @param {Object} context
 * @param {RetryRet} ret
 * @return {boolean}
 */
TokenExpiredRetryPolicy.prototype.shouldRetry = function (context, ret) {
    const {
        resumeRecordFilePath,
        uploadApiVersion
    } = context;
    const {
        retriedTimes
    } = context[this.id];

    if (
        retriedTimes >= this.maxRetryTimes ||
        !this.isResumedUpload(resumeRecordFilePath)
    ) {
        return false;
    }

    if (!ret) {
        return false;
    }

    if (uploadApiVersion === 'v1' &&
        ret.resp.statusCode === 701
    ) {
        return true;
    }

    if (uploadApiVersion === 'v2' &&
        ret.resp.statusCode === 612
    ) {
        return true;
    }

    return false;
};

/**
 * @param {Object} context
 * @param {RetryRet} ret
 * @returns {Promise<boolean>}
 */
TokenExpiredRetryPolicy.prototype.prepareRetry = function (context, ret) {
    if (!this.shouldRetry(context, ret)) {
        return Promise.resolve(false);
    }
    context[this.id].retriedTimes += 1;
    return new Promise(resolve => {
        if (!context.resumeRecordFilePath) {
            resolve(true);
            return;
        }
        fs.unlink(context.resumeRecordFilePath, _err => {
            resolve(true);
        });
    });
};

/**
 * @class
 * @implements RetryPolicy
 * @constructor
 */
function ChangeEndpointRetryPolicy () {
}

/**
 * @param {Object} context
 * @returns {Promise<void>}
 */
ChangeEndpointRetryPolicy.prototype.initContext = function (context) {
    context.alternativeEndpoints = context.alternativeEndpoints || [];
    return Promise.resolve();
};

/**
 * @param {Object} context
 * @param {RetryRet} _ret
 * @return {boolean}
 */
ChangeEndpointRetryPolicy.prototype.shouldRetry = function (context, _ret) {
    return context.alternativeEndpoints.length > 0;
};

/**
 * @param {Object} context
 * @param {RetryRet} ret
 * @return {Promise<boolean>}
 */
ChangeEndpointRetryPolicy.prototype.prepareRetry = function (context, ret) {
    if (!this.shouldRetry(context, ret)) {
        return Promise.resolve(false);
    }
    context.endpoint = context.alternativeEndpoints.shift();
    return Promise.resolve(true);
};

/**
 * @class
 * @constructor
 * @implements RetryPolicy
 */
function ChangeRegionRetryPolicy () {
}

/**
 * @param {Object} context
 * @returns {Promise<void>}
 */
ChangeRegionRetryPolicy.prototype.initContext = function (context) {
    context.alternativeRegions = context.alternativeRegions || [];
    return Promise.resolve();
};

/**
 * @param {Object} context
 * @param {RetryRet} _ret
 * @returns {boolean}
 */
ChangeRegionRetryPolicy.prototype.shouldRetry = function (context, _ret) {
    return context.alternativeRegions.length > 0;
};

/**
 * @param {Object} context
 * @param {RetryRet} ret
 * @returns {Promise<boolean>}
 */
ChangeRegionRetryPolicy.prototype.prepareRetry = function (context, ret) {
    if (!this.shouldRetry(context, ret)) {
        return Promise.resolve(false);
    }

    const {
        resumeRecordFilePath,
        serviceName
    } = context;

    // resume upload change region
    if (resumeRecordFilePath) {
        try {
            fs.unlinkSync(resumeRecordFilePath);
        } catch (_e) {
            // ignore
        }
    }

    // normal change region
    context.region = context.alternativeRegions.shift();
    return StaticEndpointsProvider.fromRegion(
        context.region,
        serviceName
    )
        .getEndpoints()
        .then(([endpoint, ...alternativeEndpoints]) => {
            context.endpoint = endpoint;
            context.alternativeEndpoints = alternativeEndpoints;
            return Promise.resolve(true);
        });
};

/**
 * @class
 * @constructor
 * @param {Object} options
 * @param {RetryPolicy[]} [options.retryPolicies]
 * @param {string} [options.resumeRecordFilePath]
 * @param {RegionsProvider} options.regionsProvider
 * @param {'v1' | 'v2' | string} options.uploadApiVersion
 * @param {EndpointsProvider} [options.preferredEndpointsProvider]
 */
function UploadState (options) {
    this.retryPolicies = options.retryPolicies || [];
    this.regionsProvider = options.regionsProvider;
    this.preferredEndpointsProvider = options.preferredEndpointsProvider;
    this.context = {
        serviceName: SERVICE_NAME.UP,
        uploadApiVersion: options.uploadApiVersion,
        resumeRecordFilePath: options.resumeRecordFilePath
    };
}

/**
 * @returns {Promise<void>}
 */
UploadState.prototype.init = function () {
    /**
     * loop regions try to find the first region with at least one endpoint
     * @returns {Promise<Endpoint[]>}
     */
    const loopRegions = () => {
        const endpointProvider = StaticEndpointsProvider.fromRegion(
            this.context.region,
            this.context.serviceName
        );
        return endpointProvider.getEndpoints()
            .then(endpoints => {
                [this.context.endpoint, ...this.context.alternativeEndpoints] = endpoints;
                // check endpoint available and change to next region if not
                if (this.context.endpoint) {
                    return;
                }
                if (!this.context.alternativeRegions.length) {
                    return Promise.reject(new Error(
                        'There isn\'t available endpoint of ' +
                        this.context.serviceName +
                        ' service in any regions'
                    ));
                }
                this.context.region = this.context.alternativeRegions.shift();
                return loopRegions();
            });
    };
    let preferredEndpoints;
    return Promise.resolve()
        .then(() => {
            if (this.preferredEndpointsProvider) {
                return this.preferredEndpointsProvider.getEndpoints();
            }
            return [];
        })
        .then(endpoints => {
            preferredEndpoints = endpoints;
            return this.regionsProvider.getRegions();
        })
        .then(regions => {
            regions = regions.slice();
            // find preferred region by preferred endpoints
            let preferredRegionIndex = -1;
            if (preferredEndpoints.length) {
                preferredRegionIndex = regions.findIndex(r =>
                    r.services[this.context.serviceName].some(e =>
                        preferredEndpoints.map(pe => pe.host).includes(e.host)
                    )
                );
            }
            // preferred endpoints is not a region, then make all regions alternative
            if (preferredEndpoints.length && preferredRegionIndex < 0) {
                [this.context.endpoint, ...this.context.alternativeEndpoints] = preferredEndpoints;
                this.context.alternativeRegions = regions;
                return Promise.resolve();
            }
            // preferred endpoints is a region, then reorder the regions
            if (preferredEndpoints.length && preferredRegionIndex > 0) {
                [this.context.region] = regions.splice(preferredRegionIndex, 1);
                this.context.alternativeRegions = regions;
            } else {
                [this.context.region, ...this.context.alternativeRegions] = regions;
            }
            // check region available
            if (!this.context.region) {
                return Promise.reject(new Error('There isn\'t available region'));
            }
            return loopRegions();
        })
        .then(() => {
            // initial all retry policies
            return this.retryPolicies.reduce(
                (promiseChain, retrier) => {
                    return promiseChain.then(() => retrier.initContext(this.context));
                },
                Promise.resolve()
            );
        });
};

/**
 * @param {RetryRet} ret
 * @returns {Promise<boolean>}
 */
UploadState.prototype.prepareRetry = function (ret) {
    let [retryPolicy, ...alternativeRetryPolicies] = this.retryPolicies;
    const loopRetryPolicies = () => {
        if (!retryPolicy) {
            return Promise.resolve(false);
        }
        return retryPolicy.prepareRetry(this.context, ret)
            .then(readyToRetry => {
                if (readyToRetry) {
                    return true;
                }
                retryPolicy = alternativeRetryPolicies.shift();
                if (!retryPolicy) {
                    return false;
                }
                return loopRetryPolicies();
            });
    };
    return loopRetryPolicies();
};

/**
 * @callback WorkFn
 * @param {Endpoint} endpoint
 * @returns {Promise<{ err: Error, ret: any, info: IncomingMessage }>}
 */

/**
 * @callback ReqcallbackFunc
 * @param {Error} err
 * @param {any} ret
 * @param {http.IncomingMessage} info
 */

/**
 * @param options
 * @param {WorkFn} options.workFn
 * @param {ReqcallbackFunc} [options.callbackFunc]
 * @param {RegionsProvider} options.regionsProvider
 * @param {RetryPolicy[]} [options.retryPolicies]
 * @param {'v1' | 'v2' | string} [options.uploadApiVersion]
 * @param {string} [options.resumeRecordFilePath]
 * @param {EndpointsProvider} [options.preferredEndpointsProvider]
 * @returns {Promise<RetryRet>}
 */
function doWorkWithRetry (options) {
    const workFn = options.workFn;

    const callbackFunc = options.callbackFunc;
    const isValidCallback = typeof callbackFunc === 'function';
    const regionsProvider = options.regionsProvider;
    const retryPolicies = options.retryPolicies || [];
    const uploadApiVersion = options.uploadApiVersion;
    const resumeRecordFilePath = options.resumeRecordFilePath;
    const preferredEndpointsProvider = options.preferredEndpointsProvider;

    const uploadState = new UploadState({
        retryPolicies,
        regionsProvider,
        uploadApiVersion,
        resumeRecordFilePath,
        preferredEndpointsProvider
    });

    // the workFn helper used for recursive calling to retry
    const workFnWithRetry = () => {
        return workFn(uploadState.context.endpoint)
            .then(resp => {
                const {
                    ret,
                    info
                } = resp;
                const respWrapper = new ResponseWrapper({
                    data: ret,
                    resp: info
                });
                if (!respWrapper.needRetry()) {
                    return resp;
                }
                return uploadState.prepareRetry({ data: ret, resp: info })
                    .then(readyToRetry => {
                        if (readyToRetry) {
                            return workFnWithRetry();
                        }
                        return resp;
                    });
            });
    };

    return uploadState.init()
        .then(() => {
            return workFnWithRetry();
        })
        // change Promise style resolve object for more ease refactoring to RespWrapper in future
        .then(({ err, ret, info }) => {
            if (err) {
                return Promise.reject(err);
            }
            try {
                isValidCallback && callbackFunc(null, ret, info);
            } catch (e) {
                warningCallbackError(e);
            }
            return Promise.resolve({ data: ret, resp: info });
        })
        .catch(err => {
            // `info` doesn't pass to callback by legacy, could be improved in the future.
            try {
                isValidCallback && callbackFunc(err, null, null);
            } catch (e) {
                warningCallbackError(e);
            }
            return Promise.reject(err);
        });
}

/**
 * @param {Error} e
 */
function warningCallbackError (e) {
    console.warn(
        'WARNING:\n' +
        'qiniu SDK will migrate API to Promise style gradually.\n' +
        'The callback style will not be removed for now,\n' +
        'but you should catch your error in your callback function itself'
    );
    console.error(e);
}
