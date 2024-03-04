const querystring = require('querystring');
const encodeUrl = require('encodeurl');
const client = require('../httpc/client');
const conf = require('../conf');
const digest = require('../auth/digest');
const util = require('../util');
const middleware = require('../httpc/middleware');
const { SERVICE_NAME } = require('../httpc/region');
const { EndpointsRetryPolicy } = require('../httpc/endpointsRetryPolicy');
const { RegionsRetryPolicy } = require('../httpc/regionsRetryPolicy');
const { Retrier } = require('../retry');
const pkg = require('../../package.json');

const { wrapTryCallback } = require('./internal');

exports.BucketManager = BucketManager;
exports.PutPolicy = PutPolicy;

/**
 * @typedef {function(Error, any, IncomingMessage)} BucketOperationCallback
 */

/**
 * @param {digest.Mac} [mac]
 * @param {conf.Config} [config]
 * @constructor
 */
function BucketManager (mac, config) {
    this.mac = mac || new digest.Mac();
    this.config = config || new conf.Config();

    let uaMiddleware = new middleware.UserAgentMiddleware(pkg.version);
    // compact set UA by conf.USER_AGENT
    uaMiddleware = Object.defineProperty(uaMiddleware, 'userAgent', {
        get: function () {
            return conf.USER_AGENT;
        }
    });
    this._httpClient = new client.HttpClient({
        middlewares: [
            uaMiddleware,
            new middleware.QiniuAuthMiddleware({
                mac: this.mac
            })
        ]
    });
}

/**
 * @private
 * @param {Endpoint} endpoint
 * @returns {string}
 */
function _getEndpointVal (endpoint) {
    const preferredScheme = this.config.useHttpsDomain ? 'https' : 'http';
    return endpoint.getValue({
        scheme: preferredScheme
    });
}

/**
 * @private
 * @param {RegionsProvider} options.regionsProvider
 * @param {SERVICE_NAME} options.serviceName
 * @returns {RetryPolicy[]}
 */
function _getRetryPolicies (options) {
    const {
        regionsProvider,
        serviceName
    } = options;
    return [
        new EndpointsRetryPolicy({
            skipInitContext: true
        }),
        new RegionsRetryPolicy({
            regionsProvider,
            serviceName
        })
    ];
}

/**
 * @private
 * @param {Object} options
 * @param {string} options.bucketName
 * @param {SERVICE_NAME} options.serviceName
 * @returns {Promise<Retrier>}
 */
function _getRegionsRetrier (options) {
    const {
        bucketName,
        serviceName
    } = options;
    return this.config.getRegionsProvider({
        bucketName,
        accessKey: this.mac.accessKey
    })
        .then(regionsProvider => {
            const retryPolicies = _getRetryPolicies.call(this, {
                regionsProvider,
                serviceName
            });
            return new Retrier({
                retryPolicies,
                onBeforeRetry: context => context.result && context.result.needRetry()
            });
        });
}

/**
 * @private
 * @param {Object} options
 * @param {EndpointsProvider} options.ucProvider
 * @returns {RetryPolicy[]}
 */
function _getUcRetryPolices (options) {
    const {
        ucProvider
    } = options;
    return [
        new EndpointsRetryPolicy({
            endpointsProvider: ucProvider
        })
    ];
}

/**
 * @private
 * @returns {Retrier}
 */
function _getUcRetrier () {
    const ucProvider = this.config.getUcEndpointsProvider();
    return new Retrier({
        retryPolicies: _getUcRetryPolices.call(this, {
            ucProvider
        }),
        onBeforeRetry: context =>
            context.result.needRetry()
    });
}

/**
 * @param {string} [options.bucketName]
 * @param {SERVICE_NAME} options.serviceName
 * @param {function(RegionsRetryPolicyContext | EndpointsRetryPolicyContext): Promise<any>} options.func
 * @returns {Promise<any>}
 * @private
 */
function _tryReq (options) {
    const {
        bucketName,
        serviceName,
        func
    } = options;

    if (serviceName === SERVICE_NAME.UC) {
        const retrier = _getUcRetrier.call(this);
        return retrier.initContext()
            .then(context => retrier.retry({
                func,
                context
            }));
    }

    if (!bucketName) {
        return Promise.reject(new Error('Must provide bucket name for non-uc services'));
    }

    return _getRegionsRetrier.call(this, {
        bucketName,
        serviceName
    })
        .then(retrier => Promise.all([
            retrier,
            retrier.initContext()
        ]))
        .then(([retrier, context]) => retrier.retry({
            func,
            context
        }));
}

/**
 * 获取资源信息
 * @link https://developer.qiniu.com/kodo/api/1308/stat
 * @param {string} bucket 空间名称
 * @param {string} key 文件名称
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.stat = function (bucket, key, callbackFunc) {
    const statOp = exports.statOp(bucket, key);
    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.RS,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + statOp;
            return this._httpClient.get({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 修改文件的类型
 * @link https://developer.qiniu.com/kodo/api/1252/chgm
 * @param {string} bucket 空间名称
 * @param {string} key 文件名称
 * @param {string} newMime 新文件类型
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.changeMime = function (
    bucket,
    key,
    newMime,
    callbackFunc
) {
    const changeMimeOp = exports.changeMimeOp(bucket, key, newMime);
    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.RS,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + changeMimeOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 修改文件返回的 Headers 内容
 * @link https://developer.qiniu.com/kodo/1252/chgm
 * @param {string} bucket  空间名称
 * @param {string} key 文件名称
 * @param {Object.<string, string>} headers 需要修改的 headers
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.changeHeaders = function (
    bucket,
    key,
    headers,
    callbackFunc
) {
    const changeHeadersOp = exports.changeHeadersOp(bucket, key, headers);
    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.RS,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + changeHeadersOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 移动或重命名文件，当 bucketSrc == bucketDest 相同的时候，就是重命名文件操作
 * @link https://developer.qiniu.com/kodo/1288/move
 * @param {string} srcBucket 源空间名称
 * @param {string} srcKey 源文件名称
 * @param {string} destBucket 目标空间名称
 * @param {string} destKey 目标文件名称
 * @param {Object} [options] 可选参数
 * @param {boolean} [options.force] 强制覆盖
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.move = function (
    srcBucket,
    srcKey,
    destBucket,
    destKey,
    options,
    callbackFunc
) {
    const moveOp = exports.moveOp(srcBucket, srcKey, destBucket, destKey, options);
    return _tryReq.call(this, {
        bucketName: srcBucket,
        serviceName: SERVICE_NAME.RS,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + moveOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 复制一个文件
 * @link https://developer.qiniu.com/kodo/1254/copy
 * @param {string} srcBucket  源空间名称
 * @param {string} srcKey     源文件名称
 * @param {string} destBucket 目标空间名称
 * @param {string} destKey    目标文件名称
 * @param {Object} [options] 可选参数
 * @param {boolean} [options.force] 强制覆盖
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.copy = function (
    srcBucket,
    srcKey,
    destBucket,
    destKey,
    options,
    callbackFunc
) {
    const copyOp = exports.copyOp(srcBucket, srcKey, destBucket, destKey, options);
    return _tryReq.call(this, {
        bucketName: srcBucket,
        serviceName: SERVICE_NAME.RS,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + copyOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 删除资源
 * @link https://developer.qiniu.com/kodo/1257/delete
 * @param {string} bucket 空间名称
 * @param {string} key 文件名称
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.delete = function (bucket, key, callbackFunc) {
    const deleteOp = exports.deleteOp(bucket, key);
    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.RS,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + deleteOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 更新文件的生命周期
 * @link https://developer.qiniu.com/kodo/1732/update-file-lifecycle
 * @param {string} bucket 空间名称
 * @param {string} key 文件名称
 * @param {number} days 有效期天数
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.deleteAfterDays = function (
    bucket,
    key,
    days,
    callbackFunc
) {
    const deleteAfterDaysOp = exports.deleteAfterDaysOp(bucket, key, days);
    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.RS,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + deleteAfterDaysOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * @param {string} bucket - 空间名称
 * @param {string} key - 文件名称
 * @param {Object} [options] - 配置项
 * @param {number} [options.toIaAfterDays] - 多少天后将文件转为低频存储，设置为 -1 表示取消已设置的转低频存储的生命周期规则， 0 表示不修改转低频生命周期规则。
 * @param {number} [options.toArchiveAfterDays] - 多少天后将文件转为归档存储，设置为 -1 表示取消已设置的转归档存储的生命周期规则， 0 表示不修改转归档生命周期规则。
 * @param {number} [options.toArchiveIRAfterDays] - 多少天后将文件转为归档直读存储，设置为 -1 表示取消已设置的转归档直读存储的生命周期规则， 0 表示不修改转归档直读生命周期规则。
 * @param {number} [options.toDeepArchiveAfterDays] - 多少天后将文件转为深度归档存储，设置为 -1 表示取消已设置的转深度归档存储的生命周期规则， 0 表示不修改转深度归档生命周期规则。
 * @param {number} [options.deleteAfterDays] - 多少天后将文件删除，设置为 -1 表示取消已设置的删除存储的生命周期规则， 0 表示不修改删除存储的生命周期规则。
 * @param {Object} [options.cond] - 匹配条件，只有条件匹配才会设置成功
 * @param {string} [options.cond.hash]
 * @param {string} [options.cond.mime]
 * @param {number} [options.cond.fsize]
 * @param {number} [options.cond.putTime]
 * @param {function} [callbackFunc] - 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.setObjectLifeCycle = function (
    bucket,
    key,
    options,
    callbackFunc
) {
    options = options || {};
    const setObjectLifecycleOp = exports.setObjectLifecycleOp(bucket, key, options);
    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.RS,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + setObjectLifecycleOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 抓取资源
 * @link https://developer.qiniu.com/kodo/1263/fetch
 * @param {string} resUrl 资源链接
 * @param {string} bucket 空间名称
 * @param {string} key 文件名称
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.fetch = function (resUrl, bucket, key, callbackFunc) {
    const encodedEntryURI = util.encodedEntry(bucket, key);
    const encodedResURL = util.urlsafeBase64Encode(resUrl);
    const fetchOp = `/fetch/${encodedResURL}/to/${encodedEntryURI}`;

    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.IO,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + fetchOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 镜像资源更新
 * @link https://developer.qiniu.com/kodo/1293/prefetch
 * @param {string} bucket 空间名称
 * @param {string} key 文件名称
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.prefetch = function (bucket, key, callbackFunc) {
    const encodedEntryURI = util.encodedEntry(bucket, key);
    const prefetchOp = `/prefetch/${encodedEntryURI}`;
    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.IO,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + prefetchOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 修改文件的存储类型
 * @link https://developer.qiniu.com/kodo/3710/chtype
 * @param {string} bucket 空间名称
 * @param {string} key 文件名称
 * @param {number} newType 新文件存储类型
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.changeType = function (
    bucket,
    key,
    newType,
    callbackFunc
) {
    const changeTypeOp = exports.changeTypeOp(bucket, key, newType);
    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.RS,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + changeTypeOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 设置空间镜像源
 * @link https://developer.qiniu.com/kodo/3966/bucket-image-source
 * @param {string} bucket 空间名称
 * @param {string} srcSiteUrl 镜像源地址
 * @param {string} [srcHost] 镜像Host
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.image = function (
    bucket,
    srcSiteUrl,
    srcHost,
    callbackFunc
) {
    const encodedSrcSite = util.urlsafeBase64Encode(srcSiteUrl);
    let reqOp = `/image/${bucket}/from/${encodedSrcSite}`;
    if (srcHost) {
        const encodedHost = util.urlsafeBase64Encode(srcHost);
        reqOp += `/host/${encodedHost}`;
    }
    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 取消设置空间镜像源
 * @param {string} bucket 空间名称
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.unimage = function (bucket, callbackFunc) {
    const reqOp = `/unimage/${bucket}`;
    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 获取指定前缀的文件列表
 * @link https://developer.qiniu.com/kodo/api/1284/list
 *
 * @param {string} bucket 空间名称
 * @param {Object} [options] 列举操作的可选参数
 * @param {string} [options.prefix] 列举的文件前缀
 * @param {string} [options.marker] 上一次列举返回的位置标记，作为本次列举的起点信息
 * @param {number} [options.limit] 每次返回的最大列举文件数量
 * @param {string} [options.delimiter] 指定目录分隔符
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.listPrefix = function (bucket, options, callbackFunc) {
    options = options || {};
    // 必须参数
    const reqParams = {
        bucket: bucket
    };

    if (options.prefix) {
        reqParams.prefix = options.prefix;
    } else {
        reqParams.prefix = '';
    }

    if (options.limit >= 1 && options.limit <= 1000) {
        reqParams.limit = options.limit;
    } else {
        reqParams.limit = 1000;
    }

    if (options.marker) {
        reqParams.marker = options.marker;
    } else {
        reqParams.marker = '';
    }

    if (options.delimiter) {
        reqParams.delimiter = options.delimiter;
    } else {
        reqParams.delimiter = '';
    }

    const reqSpec = querystring.stringify(reqParams);
    const reqOp = `/list?${reqSpec}`;

    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.RSF,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 获取指定前缀的文件列表 V2
 *
 * @deprecated API 可能返回仅包含 marker，不包含 item 或 dir 的项，请使用 {@link listPrefix}
 *
 * @param bucket 空间名称
 * @param {Object} [options] 列举操作的可选参数
 * @param {string} [options.prefix] 列举的文件前缀
 * @param {string} [options.marker] 上一次列举返回的位置标记，作为本次列举的起点信息
 * @param {number} [options.limit] 每次返回的最大列举文件数量
 * @param {string} [options.delimiter] 指定目录分隔符
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.listPrefixV2 = function (bucket, options, callbackFunc) {
    options = options || {};
    // 必须参数
    const reqParams = {
        bucket: bucket
    };

    if (options.prefix) {
        reqParams.prefix = options.prefix;
    } else {
        reqParams.prefix = '';
    }

    if (options.limit) {
        reqParams.limit = Math.min(1000, Math.max(0, options.limit));
    } else {
        reqParams.limit = 0;
    }

    if (options.marker) {
        reqParams.marker = options.marker;
    } else {
        reqParams.marker = '';
    }

    if (options.delimiter) {
        reqParams.delimiter = options.delimiter;
    } else {
        reqParams.delimiter = '';
    }

    const reqSpec = querystring.stringify(reqParams);
    const reqOp = `/v2/list?${reqSpec}`;

    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.RSF,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post(
                {
                    url: requestURL,
                    callback: wrapTryCallback(callbackFunc)
                },
                {
                    dataType: 'text'
                }
            );
        }
    });
};

/**
 * 批量文件管理请求，支持stat，chgm，chtype，delete，copy，move
 * @param {string[]} operations 操作
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.batch = function (operations, callbackFunc) {
    if (!operations.length) {
        const error = new Error('Empty operations');
        if (typeof callbackFunc === 'function') {
            callbackFunc(error, null, null);
        }
        return Promise.reject(error);
    }

    let bucket;
    for (const op of operations) {
        const [, , entry] = op.split('/');
        if (!entry) {
            continue;
        }
        [bucket] = util.decodedEntry(entry);
        if (bucket) {
            break;
        }
    }
    if (!bucket) {
        const error = new Error('Empty bucket');
        callbackFunc(error, null, null);
        return Promise.reject(error);
    }

    const reqOp = '/batch';
    const reqParams = {
        op: operations
    };
    const reqData = querystring.stringify(reqParams);

    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.RS,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                data: reqData,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 批量操作支持的指令构造器
 * @param {string} bucket
 * @param {string} key
 * @returns {string}
 */
exports.statOp = function (bucket, key) {
    return '/stat/' + util.encodedEntry(bucket, key);
};

/**
 * @param {string} bucket
 * @param {string} key
 * @returns {string}
 */
exports.deleteOp = function (bucket, key) {
    return `/delete/${util.encodedEntry(bucket, key)}`;
};

/**
 * @param {string} bucket
 * @param {string} key
 * @param {number} days
 * @returns {string}
 */
exports.deleteAfterDaysOp = function (bucket, key, days) {
    const encodedEntryURI = util.encodedEntry(bucket, key);
    return `/deleteAfterDays/${encodedEntryURI}/${days}`;
};

/**
 * @param {string} bucket 空间名称
 * @param {string} key 文件名称
 * @param {Object} [options] 配置项
 * @param {number} [options.toIaAfterDays] 多少天后将文件转为低频存储，设置为 -1 表示取消已设置的转低频存储的生命周期规则， 0 表示不修改转低频生命周期规则。
 * @param {number} [options.toArchiveAfterDays] 多少天后将文件转为归档存储，设置为 -1 表示取消已设置的转归档存储的生命周期规则， 0 表示不修改转归档生命周期规则。
 * @param {number} [options.toArchiveIRAfterDays] 多少天后将文件转为归档直读存储，设置为 -1 表示取消已设置的转归档直读存储的生命周期规则， 0 表示不修改转归档直读生命周期规则。
 * @param {number} [options.toDeepArchiveAfterDays] 多少天后将文件转为深度归档存储，设置为 -1 表示取消已设置的转深度归档存储的生命周期规则， 0 表示不修改转深度归档生命周期规则。
 * @param {number} [options.deleteAfterDays] 多少天后将文件删除，设置为 -1 表示取消已设置的删除存储的生命周期规则， 0 表示不修改删除存储的生命周期规则。
 * @param {Object} [options.cond] 匹配条件，只有条件匹配才会设置成功
 * @param {string} [options.cond.hash]
 * @param {string} [options.cond.mime]
 * @param {number} [options.cond.fsize]
 * @param {number} [options.cond.putTime]
 * @returns {string}
 */
exports.setObjectLifecycleOp = function (bucket, key, options) {
    const encodedEntry = util.encodedEntry(bucket, key);
    let result = '/lifecycle/' + encodedEntry +
        '/toIAAfterDays/' + (options.toIaAfterDays || 0) +
        '/toArchiveIRAfterDays/' + (options.toArchiveIRAfterDays || 0) +
        '/toArchiveAfterDays/' + (options.toArchiveAfterDays || 0) +
        '/toDeepArchiveAfterDays/' + (options.toDeepArchiveAfterDays || 0) +
        '/deleteAfterDays/' + (options.deleteAfterDays || 0);
    if (options.cond) {
        const condStr = Object.keys(options.cond)
            .reduce(function (acc, key) {
                acc.push(key + '=' + options.cond[key]);
                return acc;
            }, [])
            .join('&');
        result += '/cond/' + util.urlsafeBase64Encode(condStr);
    }
    return result;
};

/**
 * @param {string} bucket
 * @param {string} key
 * @param {string} newMime
 * @returns {string}
 */
exports.changeMimeOp = function (bucket, key, newMime) {
    const encodedEntryURI = util.encodedEntry(bucket, key);
    const encodedMime = util.urlsafeBase64Encode(newMime);
    return `/chgm/${encodedEntryURI}/mime/${encodedMime}`;
};

/**
 * @param {string} bucket
 * @param {string} key
 * @param {Object<string, string>} headers
 * @returns {string}
 */
exports.changeHeadersOp = function (bucket, key, headers) {
    const encodedEntryURI = util.encodedEntry(bucket, key);
    const prefix = 'x-qn-meta-!';
    let path = `/chgm/${encodedEntryURI}`;
    for (const headerKey in headers) {
        const encodedValue = util.urlsafeBase64Encode(headers[headerKey]);
        const prefixedHeaderKey = prefix + headerKey;
        path += `/${prefixedHeaderKey}/${encodedValue}`;
    }

    return path;
};

/**
 * @param {string} bucket
 * @param {string} key
 * @param {number} newType
 * @returns {string}
 */
exports.changeTypeOp = function (bucket, key, newType) {
    const encodedEntryURI = util.encodedEntry(bucket, key);
    return `/chtype/${encodedEntryURI}/type/${newType}`;
};

/**
 * @param {string} bucket
 * @param {string} key
 * @param {number} newStatus
 * @returns {string}
 */
exports.changeStatusOp = function (bucket, key, newStatus) {
    const encodedEntryURI = util.encodedEntry(bucket, key);
    return `/chstatus/${encodedEntryURI}/status/${newStatus}`;
};

/**
 * @param {string} srcBucket
 * @param {string} srcKey
 * @param {string} destBucket
 * @param {string} destKey
 * @param {Object} [options]
 * @param {boolean} [options.force]
 * @returns {string}
 */
exports.moveOp = function (srcBucket, srcKey, destBucket, destKey, options) {
    options = options || {};
    const encodedEntryURISrc = util.encodedEntry(srcBucket, srcKey);
    const encodedEntryURIDest = util.encodedEntry(destBucket, destKey);
    let op = `/move/${encodedEntryURISrc}/${encodedEntryURIDest}`;
    if (options.force) {
        op += '/force/true';
    }
    return op;
};

/**
 * @param {string} srcBucket
 * @param {string} srcKey
 * @param {string} destBucket
 * @param {string} destKey
 * @param {Object} [options]
 * @param {boolean} [options.force]
 * @returns {string}
 */
exports.copyOp = function (srcBucket, srcKey, destBucket, destKey, options) {
    options = options || {};
    const encodedEntryURISrc = util.encodedEntry(srcBucket, srcKey);
    const encodedEntryURIDest = util.encodedEntry(destBucket, destKey);
    let op = `/copy/${encodedEntryURISrc}/${encodedEntryURIDest}`;
    if (options.force) {
        op += '/force/true';
    }
    return op;
};

/**
 * 获取下载链接
 * @param domain 空间绑定的域名，比如以http或https开头
 * @param fileName 原始文件名
 * @param deadline 文件有效期时间戳（单位秒）
 * @returns {string} 私有下载链接
 */
BucketManager.prototype.privateDownloadUrl = function (
    domain,
    fileName,
    deadline
) {
    let baseUrl = this.publicDownloadUrl(domain, fileName);
    if (baseUrl.indexOf('?') >= 0) {
        baseUrl += '&e=';
    } else {
        baseUrl += '?e=';
    }
    baseUrl += deadline;

    const signature = util.hmacSha1(baseUrl, this.mac.secretKey);
    const encodedSign = util.base64ToUrlSafe(signature);
    const downloadToken = `${this.mac.accessKey}:${encodedSign}`;
    return `${baseUrl}&token=${downloadToken}`;
};

/**
 * 获取公开空间的下载链接
 * @param {string} domain 空间绑定的域名，比如以 http 或 https 开头
 * @param {string} fileName 原始文件名
 * @returns {string} 公开下载链接
 */
BucketManager.prototype.publicDownloadUrl = function (domain, fileName) {
    return domain + '/' + encodeUrl(fileName);
};

/**
 * 修改文件状态
 * @link https://developer.qiniu.com/kodo/4173/modify-the-file-status
 * @param {string} bucket 空间名称
 * @param {string} key 文件名称
 * @param {number} status 文件状态
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<void>}
 */
BucketManager.prototype.updateObjectStatus = function (
    bucket,
    key,
    status,
    callbackFunc
) {
    const changeStatusOp = exports.changeStatusOp(bucket, key, status);
    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.RS,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + changeStatusOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 列举 bucket
 * @link https://developer.qiniu.com/kodo/3926/get-service
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.listBucket = function (callbackFunc) {
    const listBucketOp = '/buckets';

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + listBucketOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 获取bucket信息
 * @param {string} bucket 空间名
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 * @returns {Promise<any>}
 */
BucketManager.prototype.getBucketInfo = function (bucket, callbackFunc) {
    const bucketInfoOp = `/v2/bucketInfo?bucket=${bucket}`;
    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + bucketInfoOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 增加 bucket 规则
 * @param { string } bucket 空间名
 *
 * @param {Object} options 配置项
 * @param {string} options.name 规则名称 bucket 内唯一，长度小于50，不能为空，只能为字母、数字、下划线
 * @param {string} [options.prefix] 同一个 bucket 里面前缀不能重复
 * @param {number} [options.to_line_after_days] 指定文件上传多少天后转低频存储。指定为0表示不转低频存储
 * @param {number} [options.to_archive_ir_after_days] 指定文件上传多少天后转归档直读存储。指定为0表示不转归档直读
 * @param {number} [options.to_archive_after_days] 指定文件上传多少天后转归档存储。指定为0表示不转归档存储
 * @param {number} [options.to_deep_archive_after_days] 指定文件上传多少天后转深度归档存储。指定为0表示不转深度归档存储
 * @param {number} [options.delete_after_days] 指定上传文件多少天后删除，指定为0表示不删除，大于0表示多少天后删除
 * @param {number} [options.history_delete_after_days] 指定文件成为历史版本多少天后删除，指定为0表示不删除，大于0表示多少天后删除
 * @param {number} [options.history_to_line_after_days] 指定文件成为历史版本多少天后转低频存储。指定为0表示不转低频存储
 *
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 *
 * @returns {Promise<any>}
 */
BucketManager.prototype.putBucketLifecycleRule = function (
    bucket,
    options,
    callbackFunc
) {
    const reqParams = Object.assign(
        {
            bucket
        },
        {
            prefix: '',
            to_line_after_days: 0,
            to_archive_ir_after_days: 0,
            to_archive_after_days: 0,
            to_deep_archive_after_days: 0,
            delete_after_days: 0,
            history_delete_after_days: 0,
            history_to_line_after_days: 0
        },
        options
    );
    const reqSpec = querystring.stringify(reqParams);
    const reqOp = '/rules/add';

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                data: reqSpec,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 删除 bucket 规则
 * @param {string} bucket 空间名
 * @param {string} name 规则名称 bucket 内唯一，长度小于50，不能为空，只能为字母、数字、下划线
 * @param {function} [callbackFunc] 回调函数
 *
 * @returns {Promise<any>}
 */
BucketManager.prototype.deleteBucketLifecycleRule = function (bucket, name, callbackFunc) {
    const reqParams = {
        bucket: bucket,
        name: name
    };
    const reqSpec = querystring.stringify(reqParams);
    const reqOp = '/rules/delete';
    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                data: reqSpec,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 更新 bucket 规则
 * @param bucket 空间名
 *
 * @param {Object} options 配置项
 * @param {string} options.name 规则名称 bucket 内唯一，长度小于50，不能为空，只能为字母、数字、下划线:
 * @param {string} [options.prefix] 同一个 bucket 里面前缀不能重复
 * @param {number} [options.to_line_after_days] 指定文件上传多少天后转低频存储。指定为0表示不转低频存储
 * @param {number} [options.to_archive_ir_after_days] 指定文件上传多少天后转归档直读存储。指定为0表示不转归档直读存储
 * @param {number} [options.to_archive_after_days] 指定文件上传多少天后转归档存储。指定为0表示不转归档存储
 * @param {number} [options.to_deep_archive_after_days] 指定文件上传多少天后转深度归档存储。指定为0表示不转深度归档存储
 * @param {number} [options.delete_after_days] 指定上传文件多少天后删除，指定为0表示不删除，大于0表示多少天后删除
 * @param {number} [options.history_delete_after_days] 指定文件成为历史版本多少天后删除，指定为0表示不删除，大于0表示多少天后删除
 * @param {number} [options.history_to_line_after_days] 指定文件成为历史版本多少天后转低频存储。指定为0表示不转低频存储
 *
 * @param { function } callbackFunc - 回调函数
 *
 * @returns {Promise<any>}
 */
BucketManager.prototype.updateBucketLifecycleRule = function (bucket, options, callbackFunc) {
    const reqParams = Object.assign(
        {
            bucket
        },
        options
    );
    const reqSpec = querystring.stringify(reqParams);
    const reqOp = '/rules/update';

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                data: reqSpec,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 获取 bucket 规则
 * @param {string} bucket 空间名
 * @param {BucketOperationCallback} [callbackFunc] 回调函数
 *
 * @returns {Promise<any>}
 */
BucketManager.prototype.getBucketLifecycleRule = function (bucket, callbackFunc) {
    const reqOp = `/rules/get?bucket=${bucket}`;
    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.get({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 增加事件通知规则
 * @param {string} bucket
 * @param {Object} options
 * @param {string} options.name
 * @param {string} options.event
 * @param {string} options.callbackURL
 * @param {string} [options.prefix]
 * @param {string} [options.suffix]
 * @param {string} [options.access_key]
 * @param {string} [options.host]
 * @param {BucketOperationCallback} [callbackFunc]
 *
 * @returns {Promise<any>}
 */
BucketManager.prototype.putBucketEvent = function (bucket, options, callbackFunc) {
    const reqParams = Object.assign(
        { // 必填参数
            bucket: bucket
        },
        // the flowing fields is optional in server
        // keep compatibility with old sdk versions
        {
            prefix: '',
            suffix: '',
            access_key: '',
            host: ''
        },
        options
    );

    const reqSpec = querystring.stringify(reqParams);

    // in docs the params should be putted into body
    // keep compatibility with old sdk versions
    const reqOp = '/events/add';

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                data: reqSpec,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 更新事件通知规则
 * @param {string} bucket
 * @param {Object} options
 * @param {string} options.name
 * @param {string} [options.prefix]
 * @param {string} [options.suffix]
 * @param {string} [options.event]
 * @param {string} [options.callbackURL]
 * @param {string} [options.access_key]
 * @param {string} [options.host]
 * @param {BucketOperationCallback} [callbackFunc]
 */
BucketManager.prototype.updateBucketEvent = function (bucket, options, callbackFunc) {
    const reqParams = Object.assign(
        {
            bucket: bucket
        },
        options
    );

    const reqSpec = querystring.stringify(reqParams);
    const reqOp = '/events/update';

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                data: reqSpec,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 获取事件通知规则
 * @param {string} bucket
 * @param {BucketOperationCallback} [callbackFunc]
 */
BucketManager.prototype.getBucketEvent = function (bucket, callbackFunc) {
    const reqOp = `/events/get?bucket=${bucket}`;

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.get({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 删除事件通知规则
 * @param {string} bucket
 * @param {string} name
 * @param {BucketOperationCallback} [callbackFunc]
 * @returns {Promise<any>}
 */
BucketManager.prototype.deleteBucketEvent = function (bucket, name, callbackFunc) {
    const reqParams = {
        bucket: bucket,
        name: name
    };
    const reqSpec = querystring.stringify(reqParams);
    const reqOp = '/events/delete';

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                data: reqSpec,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 设置防盗链
 * @param {string} bucket 空间名
 * @param {Object} options
 * @param {number} options.mode 防盗链模式。0: 表示关闭; 1: 表示设置Referer白名单; 2: 表示设置Referer黑名单
 * @param {number} options.norefer 是否支持空 Referer 访问。0: 表示不允许空 Refer 访问; 1: 表示允许空 Refer 访问
 * @param {string} options.pattern Referer 规则，多个规则之间用 `;` 隔开。当前支持规则：
 *     - 空主机头域名, 比如 foo.com
 *     - 泛域名, 比如 *.foo.com
 *     - 完全通配符, 即一个 *
 * @param {string} [options.source_enabled] 是否为源站开启。默认为 0 只给 CDN 配置, 设置为 1 表示开启源站防盗链
 * @param {BucketOperationCallback} [callbackFunc]
 * @returns {Promise<any>}
 */
BucketManager.prototype.putReferAntiLeech = function (bucket, options, callbackFunc) {
    const reqParams = Object.assign(
        {
            bucket
        },
        {
            mode: 0,
            norefer: 0,
            pattern: '*',
            source_enabled: 0
        },
        options
    );

    const reqSpec = querystring.stringify(reqParams);
    const reqOp = `/referAntiLeech?${reqSpec}`;

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * @typedef CorsRule
 * @property {string[]} allowed_origin
 * @property {string[]} allowed_method
 * @property {string[]} [allowed_header]
 * @property {string[]} [exposed_header]
 * @property {number} [max_age]
 */

/**
 * 设置空间的 cors（跨域）规则
 * @param {string} bucket
 * @param {CorsRule[]} body
 * @param [callbackFunc]
 * @returns {Promise<any>}
 */
BucketManager.prototype.putCorsRules = function (bucket, body, callbackFunc) {
    const reqBody = JSON.stringify(body);
    const reqOp = `/corsRules/set/${bucket}`;

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                data: reqBody,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 获取空间跨域规则
 * @param {string} bucket
 * @param {BucketOperationCallback} [callbackFunc]
 */
BucketManager.prototype.getCorsRules = function (bucket, callbackFunc) {
    const reqOp = '/corsRules/get/' + bucket;

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * @param {string} bucket 空间名称
 * @param {number} mode 为 1 表示开启原图保护，0 表示关闭
 * @param {BucketOperationCallback} [callbackFunc]
 */
BucketManager.prototype.putBucketAccessStyleMode = function (bucket, mode, callbackFunc) {
    const reqOp = `/accessMode/${bucket}/mode/${mode}`;

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 设置缓存策略的 max-age 属性
 * @param {string} bucket
 * @param {Object} options
 * @param {number} options.maxAge 为 0 或者负数表示为默认值（31536000）
 * @param {BucketOperationCallback} [callbackFunc]
 */
BucketManager.prototype.putBucketMaxAge = function (bucket, options, callbackFunc) {
    let maxAge = options.maxAge;
    if (maxAge <= 0) {
        maxAge = 31536000;
    }
    const reqParams = {
        bucket: bucket,
        maxAge: maxAge
    };
    const reqSpec = querystring.stringify(reqParams);
    const reqOp = '/maxAge?' + reqSpec;

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 设置空间私有属性
 * @param {string} bucket
 * @param {Object} options
 * @param {number} [options.private] 为 0 表示公开，为 1 表示私有
 * @param {BucketOperationCallback} [callbackFunc]
 */
BucketManager.prototype.putBucketAccessMode = function (bucket, options, callbackFunc) {
    const reqParams = Object.assign(
        {
            bucket: bucket
        },
        {
            private: 0
        },
        options
    );

    const reqSpec = querystring.stringify(reqParams);
    const reqOp = `/private?${reqSpec}`;

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 设置配额
 * @param {string} bucket 空间名称，不支持授权空间
 * @param {Object} options
 * @param {number} [options.size] 空间存储量配额,参数传入 0 或不传表示不更改当前配置，传入 -1 表示取消限额，新创建的空间默认没有限额。
 * @param {number} [options.count] 空间文件数配额，参数含义同<size>
 * @param {BucketOperationCallback} [callbackFunc]
 */
BucketManager.prototype.putBucketQuota = function (bucket, options, callbackFunc) {
    options = options || {};
    const reqParams = {
        bucket: bucket
    };

    if (options.size) {
        reqParams.size = options.size;
    } else {
        reqParams.size = 0;
    }

    if (options.count) {
        reqParams.count = options.count;
    } else {
        reqParams.count = 0;
    }

    const reqSpec = `${reqParams.bucket}/size/${reqParams.size}/count/${reqParams.count}`;
    const reqOp = `/setbucketquota/${reqSpec}`;

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 获取配额
 * @param {string} bucket 空间名称，不支持授权空间
 * @param {BucketOperationCallback} [callbackFunc]
 */
BucketManager.prototype.getBucketQuota = function (bucket, callbackFunc) {
    const reqOp = '/getbucketquota/' + bucket;

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 获取空间的所有域名
 * @param {string} bucket
 * @param {BucketOperationCallback} [callbackFunc]
 * @returns {Promise<any>}
 */
BucketManager.prototype.listBucketDomains = function (bucket, callbackFunc) {
    const reqOp = `/v3/domains?tbl=${bucket}`;

    return _tryReq.call(this, {
        serviceName: SERVICE_NAME.UC,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + reqOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

/**
 * 解冻归档存储文件
 * @param {string} entry
 * @param {number} freezeAfterDays
 * @param [callbackFunc]
 * @returns {Promise<any>}
 */
BucketManager.prototype.restoreAr = function (entry, freezeAfterDays, callbackFunc) {
    const [bucket] = entry.split(':');
    const restoreArOp = '/restoreAr/' + util.urlsafeBase64Encode(entry) + '/freezeAfterDays/' + freezeAfterDays;

    return _tryReq.call(this, {
        bucketName: bucket,
        serviceName: SERVICE_NAME.RS,
        func: context => {
            const requestURL = _getEndpointVal.call(this, context.endpoint) + restoreArOp;
            return this._httpClient.post({
                url: requestURL,
                callback: wrapTryCallback(callbackFunc)
            });
        }
    });
};

// just for compatibility with old sdk versions
function _putPolicyBuildInKeys () {
    return ['scope', 'isPrefixalScope', 'insertOnly', 'saveKey', 'forceSaveKey',
        'endUser', 'returnUrl', 'returnBody', 'callbackUrl', 'callbackHost',
        'callbackBody', 'callbackBodyType', 'callbackFetchKey', 'persistentOps',
        'persistentNotifyUrl', 'persistentPipeline', 'fsizeLimit', 'fsizeMin',
        'detectMime', 'mimeLimit', 'deleteAfterDays', 'fileType'
    ];
}

/**
 * @typedef PutPolicyOptions
 * @extends Object.<string, string | number>
 * @property {string} scope
 * @property {number} [isPrefixalScope]
 * @property {number} [expires]
 * @property {number} [insertOnly]
 * @property {string} [saveKey]
 * @property {string} [forceSaveKey]
 * @property {string} [endUser]
 * @property {string} [returnUrl]
 * @property {string} [returnBody]
 * @property {string} [callbackUrl]
 * @property {string} [callbackHost]
 * @property {string} [callbackBody]
 * @property {string} [callbackBodyType]
 * @property {number} [callbackFetchKey]
 * @property {string} [persistentOps]
 * @property {string} [persistentNotifyUrl]
 * @property {string} [persistentPipeline]
 * @property {number} [fsizeLimit]
 * @property {number} [fsizeMin]
 * @property {string} [mimeLimit]
 * @property {number} [detectMime]
 * @property {number} [deleteAfterDays]
 * @property {number} [fileType]
 * @property {string} [transform] Deprecated
 * @property {string} [transformFallbackMode] Deprecated
 * @property {string} [transformFallbackKey] Deprecated
 */

/**
 * 上传策略
 * @link https://developer.qiniu.com/kodo/manual/1206/put-policy
 * @param {PutPolicyOptions} options
 * @constructor
 * @extends Object.<string, string | number>
 */
function PutPolicy (options) {
    if (typeof options !== 'object') {
        throw new Error('invalid putpolicy options');
    }

    Object.keys(options).forEach(k => {
        if (k === 'expires') {
            return;
        }
        this[k] = options[k];
    });

    this.expires = options.expires || 3600;
    _putPolicyBuildInKeys().forEach(k => {
        if (this[k] === undefined) {
            this[k] = this[k] || null;
        }
    });
}

PutPolicy.prototype.getFlags = function () {
    const flags = {};

    Object.keys(this).forEach(k => {
        if (k === 'expires' || this[k] === null) {
            return;
        }
        flags[k] = this[k];
    });

    flags.deadline = this.expires + Math.floor(Date.now() / 1000);

    return flags;
};

PutPolicy.prototype.uploadToken = function (mac) {
    mac = mac || new digest.Mac();
    const flags = this.getFlags();
    const encodedFlags = util.urlsafeBase64Encode(JSON.stringify(flags));
    const encoded = util.hmacSha1(encodedFlags, mac.secretKey);
    const encodedSign = util.base64ToUrlSafe(encoded);
    return [
        mac.accessKey,
        encodedSign,
        encodedFlags
    ].join(':');
};
