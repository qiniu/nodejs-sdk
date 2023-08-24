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
    ChainedRegionsProvider,
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

exports.prepareRegionsProvider = prepareRegionsProvider;
exports.doWorkWithRetry = doWorkWithRetry;
exports.ChangeEndpointRetryPolicy = ChangeEndpointRetryPolicy;
exports.ChangeRegionRetryPolicy = ChangeRegionRetryPolicy;
exports.TokenExpiredRetryPolicy = TokenExpiredRetryPolicy;
exports.UploadState = UploadState;

/**
 * @returns {StaticEndpointsProvider}
 */
function getDefaultQueryRegionEndpointsProvider () {
    /**
     * @type {string[]}
     */
    const queryRegionHosts = [conf.QUERY_REGION_HOST].concat(conf.QUERY_REGION_BACKUP_HOSTS);

    return new StaticEndpointsProvider(queryRegionHosts.map(h => new Endpoint(h)));
}

/**
 * @param {Object} options
 * @param {string} options.accessKey
 * @param {string} options.bucketName
 * @param {EndpointsProvider} [options.queryRegionsEndpointProvider]
 * @returns {ChainedRegionsProvider}
 */
function getDefaultRegionsProvider (options) {
    const cacheKey = options.accessKey + ':' + options.bucketName;
    let queryRegionsEndpointProvider = options.queryRegionsEndpointProvider;
    if (!queryRegionsEndpointProvider) {
        queryRegionsEndpointProvider = getDefaultQueryRegionEndpointsProvider();
    }

    return new ChainedRegionsProvider([
        new CachedRegionsProvider(
            cacheKey
        ),
        new QueryRegionsProvider({
            accessKey: options.accessKey,
            bucketName: options.bucketName,
            endpointsProvider: queryRegionsEndpointProvider
        })
    ]);
}

/**
 * @param {Object} options
 * @param {conf.Config} options.config
 * @param {string} options.bucketName
 * @param {string} options.accessKey
 * @returns {RegionsProvider}
 */
function prepareRegionsProvider (options) {
    const {
        config,
        bucketName,
        accessKey
    } = options;

    // prepare RegionsProvider
    let regionsProvider = config.regionsProvider;

    // backward compatibility with zone
    const zoneTtl = config.zoneExpire - Math.trunc(Date.now() / 1000);
    const isConfigZoneLive = config.zone && zoneTtl > 0;
    if (!regionsProvider && isConfigZoneLive) {
        regionsProvider = new StaticRegionsProvider([
            Region.fromZone(config.zone)
        ]);
    }

    if (!regionsProvider) {
        regionsProvider = getDefaultRegionsProvider({
            accessKey,
            bucketName
        });
    }

    return regionsProvider;
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
        retriedTimes >= this.maxRetryTimes || !this.isResumedUpload(resumeRecordFilePath)) {
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
    const coolDownDuration = Math.min(
        Math.trunc(context.region.ttl / 10) * 1000,
        3600 * 1000
    );
    context.region.coolDownBefore = new Date(Date.now() + coolDownDuration);
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
 */
function UploadState (options) {
    this.retryPolicies = options.retryPolicies || [];
    this.regionsProvider = options.regionsProvider;
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
    return this.regionsProvider.getRegions()
        .then(regions => {
            [this.context.region, ...this.context.alternativeRegions] = regions;
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
 * @param {boolean} options.isValidCallback // TODO: remove
 * @param {ReqcallbackFunc} options.callbackFunc
 * @param {RegionsProvider} options.regionsProvider
 * @param {RetryPolicy[]} [options.retryPolicies]
 * @param {'v1' | 'v2' | string} [options.uploadApiVersion]
 * @param {string} [options.resumeRecordFilePath]
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

    const uploadState = new UploadState({
        retryPolicies,
        regionsProvider,
        uploadApiVersion,
        resumeRecordFilePath
    });

    // the workFn helper used for recursive calling to retry
    const workFnWithRetry = () => {
        return workFn(uploadState.context.endpoint)
            .then(resp => {
                const {
                    err,
                    ret,
                    info
                } = resp;
                const respWrapper = new ResponseWrapper({
                    data: ret,
                    resp: info
                });
                if (err || !respWrapper.needRetry()) {
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
            isValidCallback && callbackFunc(null, ret, info);
            return Promise.resolve({ data: ret, resp: info });
        })
        .catch(err => {
            // `info` doesn't pass to callback, could be improved in the future.
            isValidCallback && callbackFunc(err, null, null);
            return Promise.reject(err);
        });
}