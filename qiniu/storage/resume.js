const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const mime = require('mime');
const getCrc32 = require('crc32');
const destroy = require('destroy');
const BlockStream = require('block-stream2');
// use the native option `recursive` when min version of Node.js update to ≥ v10.12.0
const mkdirp = require('mkdirp');

const conf = require('../conf');
const util = require('../util');
const rpc = require('../rpc');

const { SERVICE_NAME } = require('../httpc/region');
const { ResponseWrapper } = require('../httpc/responseWrapper');
const { Endpoint } = require('../httpc/endpoint');
const { StaticRegionsProvider } = require('../httpc/regionsProvider');
const { EndpointsRetryPolicy } = require('../httpc/endpointsRetryPolicy');
const { RegionsRetryPolicy } = require('../httpc/regionsRetryPolicy');
const { Retrier } = require('../retry');

const {
    AccUnavailableRetryPolicy,
    TokenExpiredRetryPolicy,
    getNoNeedRetryError,
    handleReqCallback
} = require('./internal');

exports.ResumeUploader = ResumeUploader;
exports.PutExtra = PutExtra;
exports.createResumeRecorder = createResumeRecorder;
exports.createResumeRecorderSync = createResumeRecorderSync;

/**
 * @param {conf.Config} [config]
 * @constructor
 */
function ResumeUploader (config) {
    this.config = config || new conf.Config();
}

/**
 * @callback reqCallback
 *
 * @param {Error} err
 * @param {Object} ret
 * @param {http.IncomingMessage} info
 */

/**
 * @callback progressCallback
 *
 * @param {number} uploadBytes
 * @param {number} totalBytes
 */

/**
 * 上传可选参数
 * @class
 * @constructor
 * @param {string} [fname]                      请求体中的文件的名称
 * @param {Object} [params]                     额外参数设置，参数名称必须以x:开头
 * @param {string | null} [mimeType]            指定文件的mimeType
 * @param {string | null} [resumeRecordFile]    DEPRECATED: 使用 `` 与 `` 代替；断点续传的已上传的部分信息记录文件路径
 * @param {function(number, number):void} [progressCallback] 上传进度回调，回调参数为 (uploadBytes, totalBytes)
 * @param {number} [partSize]                   分片上传v2必传字段 默认大小为4MB 分片大小范围为1 MB - 1 GB
 * @param {'v1' | 'v2'} [version]               分片上传版本 目前支持v1/v2版本 默认v1
 * @param {Object} [metadata]                   元数据设置，参数名称必须以 x-qn-meta-${name}: 开头
 * @param {JsonFileRecorder} [resumeRecorder]   通过 `createResumeRecorder` 或 `createResumeRecorderSync` 获取，优先级比 `resumeRecordFile` 低
 * @param {string} [resumeKey]                  断点续传记录文件的具体文件名，不设置时会由当次上传自动生成
 */
function PutExtra (
    fname,
    params,
    mimeType,
    resumeRecordFile,
    progressCallback,
    partSize,
    version,
    metadata,
    resumeRecorder,
    resumeKey
) {
    this.fname = fname || '';
    this.params = params || {};
    this.mimeType = mimeType || null;
    // @deprecated use resumeRecorder and resumeKey instead
    this.resumeRecordFile = resumeRecordFile || null;
    this.progressCallback = progressCallback || null;
    this.partSize = partSize || conf.BLOCK_SIZE;
    this.version = version || 'v1';
    this.metadata = metadata || {};
    this.resumeRecorder = resumeRecorder || null;
    this.resumeKey = resumeKey || null;
}

/**
 * @private
 * @param {Object} options
 * @param {string} options.accessKey
 * @param {string} options.bucketName
 * @param {string} [options.key]
 * @param {string} [options.filePath]
 * @param {PutExtra} options.putExtra
 *
 * @returns Retrier
 */
function _getRegionsRetrier (options) {
    const {
        accessKey,
        bucketName,
        key,
        filePath,

        putExtra
    } = options;

    const preferredScheme = this.config.useHttpsDomain ? 'https' : 'http';

    let regionsProviderPromise = this.config.getRegionsProvider({
        accessKey,
        bucketName
    });

    // generate resume key, if there is a recorder but not resume key
    if (putExtra.resumeRecorder && !putExtra.resumeKey) {
        regionsProviderPromise = regionsProviderPromise
            .then(regionsProvider => regionsProvider.getRegions())
            .then(regions => {
                if (!regions || !regions.length) {
                    return Promise.reject(new Error(`no region available for the bucket "${bucketName}"`));
                }
                const upAccEndpoints = regions[0].services[SERVICE_NAME.UP_ACC] || [];
                const upEndpoints = regions[0].services[SERVICE_NAME.UP] || [];
                const upHosts = upAccEndpoints.concat(upEndpoints).map(e => e.host);
                putExtra.resumeKey = putExtra.resumeRecorder.generateKeySync({
                    hosts: upHosts,
                    accessKey: accessKey,
                    bucketName: bucketName,
                    key: key,
                    filePath: filePath,
                    version: putExtra.version,
                    partSize: putExtra.partSize
                });
                return new StaticRegionsProvider(regions);
            });
    }

    return regionsProviderPromise
        .then(regionsProvider => {
            // handle preferred endpoints
            let preferredEndpoints;
            if (putExtra.resumeRecorder && putExtra.resumeKey) {
                const resumeInfo = putExtra.resumeRecorder.getSync(putExtra.resumeKey);
                if (resumeInfo && Array.isArray(resumeInfo.upDomains)) {
                    preferredEndpoints = resumeInfo.upDomains.map(d =>
                        new Endpoint(d, { defaultScheme: preferredScheme }));
                }
            }

            const serviceNames = this.config.accelerateUploading
                ? [SERVICE_NAME.UP_ACC, SERVICE_NAME.UP]
                : [SERVICE_NAME.UP];
            const retryPolicies = [
                new AccUnavailableRetryPolicy(),
                new TokenExpiredRetryPolicy({
                    uploadApiVersion: putExtra.version,
                    recordExistsHandler: () => {
                        if (!putExtra.resumeRecorder || !putExtra.resumeKey) {
                            return;
                        }
                        putExtra.resumeRecorder.hasSync(putExtra.resumeKey);
                    },
                    recordDeleteHandler: () => {
                        if (!putExtra.resumeRecorder || !putExtra.resumeKey) {
                            return;
                        }
                        putExtra.resumeRecorder.deleteSync(putExtra.resumeKey);
                    }
                }),
                new EndpointsRetryPolicy({
                    skipInitContext: true
                }),
                new RegionsRetryPolicy({
                    regionsProvider,
                    serviceNames,
                    onChangedRegion: () => {
                        if (!putExtra.resumeRecorder || !putExtra.resumeKey) {
                            return;
                        }
                        putExtra.resumeRecorder.deleteSync(putExtra.resumeKey);
                    },
                    preferredEndpoints
                })
            ];

            return new Retrier({
                retryPolicies,
                onBeforeRetry: (context, policy) => {
                    if (context.error) {
                        if (context.error.noNeedRetry) {
                            return false;
                        }
                        return true;
                    }
                    if (policy instanceof AccUnavailableRetryPolicy) {
                        return true;
                    }
                    return context.result && context.result.needRetry();
                }
            });
        });
}

/**
 * @typedef UploadResult
 * @property {any} data
 * @property {http.IncomingMessage} resp
 */

/**
 * @param {string} uploadToken
 * @param {string | null} key
 * @param {stream.Readable} rsStream
 * @param {number} rsStreamLen
 * @param {PutExtra} putExtra
 * @param {reqCallback} [callbackFunc]
 * @returns {Promise<UploadResult>}
 */
ResumeUploader.prototype.putStream = function (
    uploadToken,
    key,
    rsStream,
    rsStreamLen,
    putExtra,
    callbackFunc
) {
    const preferredScheme = this.config.useHttpsDomain ? 'https' : 'http';

    // PutExtra
    putExtra = getDefaultPutExtra(
        putExtra,
        {
            key
        }
    );

    const bucketName = util.getBucketFromUptoken(uploadToken);
    const accessKey = util.getAKFromUptoken(uploadToken);

    const result = this.config.getRegionsProvider({
        bucketName,
        accessKey
    })
        .then(regionsProvider => regionsProvider.getRegions())
        .then(regions => {
            if (!regions || !regions.length) {
                return Promise.reject(new Error('no region available for the bucket', bucketName));
            }
            const preferService = this.config.accelerateUploading
                ? SERVICE_NAME.UP_ACC
                : SERVICE_NAME.UP;
            if (
                !regions[0].services ||
                !regions[0].services[preferService] ||
                !regions[0].services[preferService].length
            ) {
                return Promise.reject(new Error('no endpoint available for the bucket', bucketName));
            }
            const endpoint = regions[0].services[preferService][0];
            return putReq(
                endpoint,
                preferredScheme,
                uploadToken,
                key,
                rsStream,
                rsStreamLen,
                putExtra
            );
        });

    handleReqCallback(result, callbackFunc);

    return result;
};

/**
 * @param {Endpoint} upEndpoint
 * @param {string} uploadToken
 * @param {string} preferredScheme
 * @param {string | null} key
 * @param {Readable} rsStream
 * @param {number} rsStreamLen
 * @param {PutExtra} putExtra
 */
function putReq (
    upEndpoint,
    preferredScheme,
    uploadToken,
    key,
    rsStream,
    rsStreamLen,
    putExtra
) {
    // make block stream
    const blkStream = rsStream.pipe(new BlockStream({
        size: putExtra.partSize,
        zeroPadding: false
    }));

    // get resume record info
    const blkputRets = putExtra.resumeRecorder && putExtra.resumeRecorder.getSync(putExtra.resumeKey);
    const totalBlockNum = Math.ceil(rsStreamLen / putExtra.partSize);

    // select upload version
    /**
     * @type {function(SourceOptions, UploadOptions, reqCallback)}
     */
    let doPutReq;
    if (putExtra.version === 'v1') {
        doPutReq = putReqV1;
    } else if (putExtra.version === 'v2') {
        doPutReq = putReqV2;
    } else {
        throw new Error('part upload version number error');
    }

    // upload parts
    return new Promise((resolve, reject) => {
        doPutReq(
            {
                blkputRets,
                rsStream,
                rsStreamLen,
                blkStream,
                totalBlockNum
            },
            {
                upEndpoint,
                preferredScheme,
                uploadToken,
                key,
                putExtra
            },
            function (err, ret, info) {
                if (err) {
                    err.resp = info;
                    reject(err);
                    return;
                }
                if (info.statusCode === 200 && putExtra.resumeRecorder && putExtra.resumeKey) {
                    putExtra.resumeRecorder.deleteSync(putExtra.resumeKey);
                }
                resolve(new ResponseWrapper({
                    data: ret,
                    resp: info
                }));
            }
        );
    });
}

/**
 * @typedef SourceOptions
 * @property {Object.<string, any> | undefined} blkputRets
 * @property {Readable} rsStream
 * @property {BlockStream} blkStream
 * @property {number} rsStreamLen
 * @property {number} totalBlockNum
 */

/**
 * @typedef UploadOptions
 * @property {string | null} key
 * @property {Endpoint} upEndpoint
 * @property {string} preferredScheme
 * @property {string} uploadToken
 * @property {PutExtra} putExtra
 */

/**
 * @param {SourceOptions} sourceOptions
 * @param {UploadOptions} uploadOptions
 * @param {reqCallback} callbackFunc
 * @returns {void}
 */
function putReqV1 (sourceOptions, uploadOptions, callbackFunc) {
    const {
        rsStream,
        blkStream,
        rsStreamLen,
        totalBlockNum
    } = sourceOptions;
    let blkputRets = sourceOptions.blkputRets;
    const {
        upEndpoint,
        preferredScheme,
        key,
        uploadToken,
        putExtra
    } = uploadOptions;

    // initial state
    const finishedCtxList = [];
    const finishedBlkPutRets = {
        upDomains: [],
        parts: []
    };
    // backward compatibility with ≤ 7.9.0
    if (Array.isArray(blkputRets)) {
        blkputRets = {
            upDomains: [],
            parts: []
        };
    }
    if (blkputRets && Array.isArray(blkputRets.upDomains)) {
        finishedBlkPutRets.upDomains = blkputRets.upDomains;
    }
    finishedBlkPutRets.upDomains.push(upEndpoint.host);

    // TODO: test what will happen when stream.on('error')
    // upload parts
    const upDomain = upEndpoint.getValue({ scheme: preferredScheme });
    let readLen = 0;
    let curBlock = 0;
    let isSent = false;
    blkStream.on('data', function (chunk) {
        readLen += chunk.length;
        let needUploadBlk = true;
        // check uploaded parts
        if (
            blkputRets &&
            blkputRets.parts &&
            blkputRets.parts.length > 0 &&
            blkputRets.parts[curBlock]
        ) {
            const blkputRet = blkputRets.parts[curBlock];
            let expiredAt = blkputRet.expired_at;
            // make sure the ctx at least has one day expiration
            expiredAt += 3600 * 24;
            if (!util.isTimestampExpired(expiredAt)) {
                needUploadBlk = false;
                finishedCtxList.push(blkputRet.ctx);
                finishedBlkPutRets.parts.push(blkputRet);
            }
        }

        curBlock += 1; // set current block
        if (needUploadBlk) {
            blkStream.pause();
            mkblkReq(
                upDomain,
                uploadToken,
                chunk,
                function (
                    respErr,
                    respBody,
                    respInfo
                ) {
                    const bodyCrc32 = parseInt('0x' + getCrc32(chunk));
                    if (respInfo.statusCode !== 200 || respBody.crc32 !== bodyCrc32) {
                        callbackFunc(respErr, respBody, respInfo);
                        destroy(rsStream);
                    } else {
                        const blkputRet = respBody;
                        finishedCtxList.push(blkputRet.ctx);
                        finishedBlkPutRets.parts.push(blkputRet);
                        if (putExtra.resumeRecorder && putExtra.resumeKey) {
                            putExtra.resumeRecorder.setSync(putExtra.resumeKey, finishedBlkPutRets);
                        }
                        if (putExtra.progressCallback) {
                            try {
                                putExtra.progressCallback(readLen, rsStreamLen);
                            } catch (err) {
                                callbackFunc(
                                    getNoNeedRetryError(
                                        err,
                                        'Some unexpect error occurred on calling progressCallback'
                                    ),
                                    respBody,
                                    respInfo
                                );
                                return;
                            }
                        }
                        blkStream.resume();
                        if (finishedCtxList.length === totalBlockNum) {
                            mkfileReq(upDomain, uploadToken, rsStreamLen, finishedCtxList, key, putExtra, callbackFunc);
                            isSent = true;
                        }
                    }
                });
        }
    });

    blkStream.on('end', function () {
        if (!isSent && finishedCtxList.length === totalBlockNum) {
            mkfileReq(upDomain, uploadToken, rsStreamLen, finishedCtxList, key, putExtra, callbackFunc);
        }
        destroy(rsStream);
    });
}

/**
 * @param {SourceOptions} sourceOptions
 * @param {UploadOptions} uploadOptions
 * @param {reqCallback} callbackFunc
 * @returns {void}
 */
function putReqV2 (sourceOptions, uploadOptions, callbackFunc) {
    const {
        blkputRets,
        blkStream,
        totalBlockNum,
        rsStreamLen,
        rsStream
    } = sourceOptions;
    const {
        upEndpoint,
        preferredScheme,
        uploadToken,
        key,
        putExtra
    } = uploadOptions;

    // try resume upload blocks
    let finishedBlock = 0;
    const finishedEtags = {
        upDomains: [],
        etags: [],
        uploadId: '',
        expiredAt: 0
    };
    if (blkputRets && Array.isArray(blkputRets.upDomains)) {
        // check etag expired or not
        const expiredAt = blkputRets.expiredAt;
        const timeNow = Date.now() / 1000;
        if (expiredAt > timeNow && blkputRets.uploadId) {
            finishedEtags.upDomains = blkputRets.upDomains;
            finishedEtags.etags = blkputRets.etags;
            finishedEtags.uploadId = blkputRets.uploadId;
            finishedEtags.expiredAt = blkputRets.expiredAt;
            finishedBlock = finishedEtags.etags.length;
        }
    }
    finishedEtags.upDomains.push(upEndpoint.host);

    const upDomain = upEndpoint.getValue({ scheme: preferredScheme });
    const bucket = util.getBucketFromUptoken(uploadToken);
    const encodedObjectName = key ? util.urlsafeBase64Encode(key) : '~';
    if (finishedEtags.uploadId) {
        if (finishedBlock === totalBlockNum) {
            completeParts(upDomain, bucket, encodedObjectName, uploadToken, finishedEtags,
                putExtra, callbackFunc);
            return;
        }
        // if it has resumeRecordFile
        resumeUploadV2(uploadToken, bucket, encodedObjectName, upDomain, blkStream,
            finishedEtags, finishedBlock, totalBlockNum, putExtra, rsStreamLen, rsStream, callbackFunc);
    } else {
        // init a new uploadId for next step
        initReq(uploadToken, bucket, encodedObjectName, upDomain, blkStream,
            finishedEtags, finishedBlock, totalBlockNum, putExtra, rsStreamLen, rsStream, callbackFunc);
    }
}

/**
 * @param {string} upDomain
 * @param {string} uploadToken
 * @param {Buffer | string} blkData
 * @param {reqCallback} callbackFunc
 */
function mkblkReq (upDomain, uploadToken, blkData, callbackFunc) {
    const requestURI = upDomain + '/mkblk/' + blkData.length;
    const auth = 'UpToken ' + uploadToken;
    const headers = {
        Authorization: auth,
        'Content-Type': 'application/octet-stream'
    };
    rpc.post(requestURI, blkData, headers, callbackFunc);
}

/**
 * @param {string} upDomain
 * @param {string} uploadToken
 * @param {number} fileSize
 * @param {string[]} ctxList
 * @param {string | null} key
 * @param putExtra
 * @param callbackFunc
 */
function mkfileReq (
    upDomain,
    uploadToken,
    fileSize,
    ctxList,
    key,
    putExtra,
    callbackFunc
) {
    let requestURI = upDomain + '/mkfile/' + fileSize;
    if (key) {
        requestURI += '/key/' + util.urlsafeBase64Encode(key);
    }
    if (putExtra.mimeType) {
        requestURI += '/mimeType/' + util.urlsafeBase64Encode(putExtra.mimeType);
    }
    if (putExtra.fname) {
        requestURI += '/fname/' + util.urlsafeBase64Encode(putExtra.fname);
    }
    if (putExtra.params) {
        // putExtra params
        for (const k in putExtra.params) {
            if (k.startsWith('x:') && putExtra.params[k]) {
                requestURI += '/' + k + '/' + util.urlsafeBase64Encode(putExtra.params[
                    k].toString());
            }
        }
    }

    // putExtra metadata
    if (putExtra.metadata) {
        for (const metadataKey in putExtra.metadata) {
            if (metadataKey.startsWith('x-qn-meta-') && putExtra.metadata[metadataKey]) {
                requestURI +=
                    '/' + metadataKey + '/' +
                    util.urlsafeBase64Encode(putExtra.metadata[metadataKey].toString());
            }
        }
    }

    const auth = 'UpToken ' + uploadToken;
    const headers = {
        Authorization: auth,
        'Content-Type': 'application/octet-stream'
    };
    const postBody = ctxList.join(',');
    rpc.post(requestURI, postBody, headers, callbackFunc);
}

/**
 * @typedef FinishedEtags
 * @property {{etag: string, partNumber: number}[]}etags
 * @property {string} uploadId
 * @property {number} expiredAt
 */

/**
 * @param {string} uploadToken
 * @param {string} bucket
 * @param {string} encodedObjectName
 * @param {string} upDomain
 * @param {BlockStream} blkStream
 * @param {FinishedEtags} finishedEtags
 * @param {number} finishedBlock
 * @param {number} totalBlockNum
 * @param {PutExtra} putExtra
 * @param {number} rsStreamLen
 * @param {stream.Readable} rsStream
 * @param {reqCallback} callbackFunc
 */
function initReq (
    uploadToken,
    bucket,
    encodedObjectName,
    upDomain,
    blkStream,
    finishedEtags,
    finishedBlock,
    totalBlockNum,
    putExtra,
    rsStreamLen,
    rsStream,
    callbackFunc
) {
    const requestUrl = upDomain + '/buckets/' + bucket + '/objects/' + encodedObjectName + '/uploads';
    const headers = {
        Authorization: 'UpToken ' + uploadToken,
        'Content-Type': 'application/json'
    };
    rpc.post(requestUrl, '', headers, function (err, ret, info) {
        if (info.statusCode !== 200) {
            callbackFunc(err, ret, info);
            return;
        }
        finishedEtags.expiredAt = ret.expireAt;
        finishedEtags.uploadId = ret.uploadId;
        resumeUploadV2(uploadToken, bucket, encodedObjectName, upDomain, blkStream,
            finishedEtags, finishedBlock, totalBlockNum, putExtra, rsStreamLen, rsStream, callbackFunc);
    });
}

/**
 * @param {string} uploadToken
 * @param {string} bucket
 * @param {string} encodedObjectName
 * @param {string} upDomain
 * @param {BlockStream} blkStream
 * @param {FinishedEtags} finishedEtags
 * @param {number} finishedBlock
 * @param {number} totalBlockNum
 * @param {PutExtra} putExtra
 * @param {number} rsStreamLen
 * @param {stream.Readable} rsStream
 * @param {reqCallback} callbackFunc
 */
function resumeUploadV2 (
    uploadToken,
    bucket,
    encodedObjectName,
    upDomain,
    blkStream,
    finishedEtags,
    finishedBlock,
    totalBlockNum,
    putExtra,
    rsStreamLen,
    rsStream,
    callbackFunc
) {
    let isSent = false;
    let readLen = 0;
    let curBlock = 0;
    blkStream.on('data', function (chunk) {
        let partNumber = 0;
        readLen += chunk.length;
        curBlock += 1; // set current block
        if (curBlock > finishedBlock) {
            blkStream.pause();
            partNumber = finishedBlock + 1;
            const bodyMd5 = util.getMd5(chunk);
            uploadPart(bucket, upDomain, uploadToken, encodedObjectName, chunk, finishedEtags.uploadId, partNumber, putExtra,
                function (respErr, respBody, respInfo) {
                    if (respInfo.statusCode !== 200 || respBody.md5 !== bodyMd5) {
                        callbackFunc(respErr, respBody, respInfo);
                        destroy(rsStream);
                    } else {
                        finishedBlock += 1;
                        const blockStatus = {
                            etag: respBody.etag,
                            partNumber: partNumber
                        };
                        finishedEtags.etags.push(blockStatus);
                        if (putExtra.resumeRecorder && putExtra.resumeKey) {
                            putExtra.resumeRecorder.setSync(putExtra.resumeKey, finishedEtags);
                        }
                        if (putExtra.progressCallback) {
                            try {
                                putExtra.progressCallback(readLen, rsStreamLen);
                            } catch (err) {
                                callbackFunc(
                                    getNoNeedRetryError(
                                        err,
                                        'Some unexpect error occurred on calling progressCallback'
                                    ),
                                    respBody,
                                    respInfo
                                );
                                return;
                            }
                        }
                        blkStream.resume();
                        if (finishedEtags.etags.length === totalBlockNum) {
                            completeParts(upDomain, bucket, encodedObjectName, uploadToken, finishedEtags,
                                putExtra, callbackFunc);
                            isSent = true;
                        }
                    }
                });
        }
    });

    blkStream.on('end', function () {
        if (!isSent && rsStreamLen === 0) {
            completeParts(upDomain, bucket, encodedObjectName, uploadToken, finishedEtags,
                putExtra, callbackFunc);
        }
        destroy(rsStream);
    });
}

/**
 * @param {string} bucket
 * @param {string} upDomain
 * @param {string} uploadToken
 * @param {string} encodedObjectName
 * @param {Buffer | string} chunk
 * @param {string} uploadId
 * @param {number} partNumber
 * @param {PutExtra} putExtra
 * @param {reqCallback} callbackFunc
 */
function uploadPart (bucket, upDomain, uploadToken, encodedObjectName, chunk, uploadId, partNumber, putExtra, callbackFunc) {
    const headers = {
        Authorization: 'UpToken ' + uploadToken,
        'Content-Type': 'application/octet-stream',
        'Content-MD5': util.getMd5(chunk)
    };
    const requestUrl = upDomain + '/buckets/' + bucket + '/objects/' + encodedObjectName + '/uploads/' + uploadId +
        '/' + partNumber.toString();
    rpc.put(requestUrl, chunk, headers, callbackFunc);
}

/**
 * @param {string} upDomain
 * @param {string} bucket
 * @param {string} encodedObjectName
 * @param {string} uploadToken
 * @param {FinishedEtags} finishedEtags
 * @param {PutExtra} putExtra
 * @param {reqCallback} callbackFunc
 */
function completeParts (
    upDomain,
    bucket,
    encodedObjectName,
    uploadToken,
    finishedEtags,
    putExtra,
    callbackFunc
) {
    const headers = {
        Authorization: 'UpToken ' + uploadToken,
        'Content-Type': 'application/json'
    };
    const sortedParts = finishedEtags.etags.sort(function (a, b) {
        return a.partNumber - b.partNumber;
    });
    const body = {
        fname: putExtra.fname,
        mimeType: putExtra.mimeType,
        customVars: putExtra.params,
        metadata: putExtra.metadata,
        parts: sortedParts
    };
    const requestUrl = upDomain + '/buckets/' + bucket + '/objects/' + encodedObjectName + '/uploads/' + finishedEtags.uploadId;
    const requestBody = JSON.stringify(body);
    rpc.post(
        requestUrl,
        requestBody,
        headers,
        callbackFunc
    );
}

/**
 * @param {string} uploadToken
 * @param {string | null} key
 * @param {string} localFile
 * @param {PutExtra} putExtra
 * @param {reqCallback} [callbackFunc]
 * @returns {Promise<UploadResult>}
 */
ResumeUploader.prototype.putFile = function (
    uploadToken,
    key,
    localFile,
    putExtra,
    callbackFunc
) {
    const preferredScheme = this.config.useHttpsDomain ? 'https' : 'http';

    // PutExtra
    putExtra = putExtra || new PutExtra();
    if (!putExtra.mimeType) {
        putExtra.mimeType = mime.getType(localFile);
    }

    if (!putExtra.fname) {
        putExtra.fname = path.basename(localFile);
    }

    const accessKey = util.getAKFromUptoken(uploadToken);
    const bucketName = util.getBucketFromUptoken(uploadToken);

    putExtra = getDefaultPutExtra(
        putExtra,
        {
            key
        }
    );

    const result = _getRegionsRetrier.call(this, {
        accessKey,
        bucketName,
        key,
        filePath: localFile,

        putExtra
    })
        .then(retrier => Promise.all([
            retrier,
            retrier.initContext()
        ]))
        .then(([retrier, context]) => retrier.retry({
            func: ctx => {
                const rsStream = fs.createReadStream(localFile, {
                    highWaterMark: conf.BLOCK_SIZE
                });
                const rsStreamLen = fs.statSync(localFile).size;
                const p = putReq(
                    ctx.endpoint,
                    preferredScheme,
                    uploadToken,
                    key,
                    rsStream,
                    rsStreamLen,
                    putExtra
                );
                p
                    .then(() => {
                        destroy(rsStream);
                    })
                    .catch(() => {
                        // use finally when min version of Node.js update to ≥ v10.3.0
                        destroy(rsStream);
                    });
                return p;
            },
            context
        }));

    handleReqCallback(result, callbackFunc);

    return result;
};

/**
 * @param {string} uploadToken
 * @param {string} localFile
 * @param {PutExtra} putExtra
 * @param {reqCallback} [callbackFunc]
 * @returns {Promise<UploadResult>}
 */
ResumeUploader.prototype.putFileWithoutKey = function (
    uploadToken,
    localFile,
    putExtra,
    callbackFunc
) {
    return this.putFile(uploadToken, null, localFile, putExtra, callbackFunc);
};

/**
 * @param {PutExtra} putExtra
 * @param {Object} options
 * @param {string | null} [options.key]
 * @returns {PutExtra}
 */
function getDefaultPutExtra (putExtra, options) {
    options = options || {};

    // assign to a new object to make the modification later
    putExtra = Object.assign(new PutExtra(), putExtra);
    if (!putExtra.mimeType) {
        putExtra.mimeType = 'application/octet-stream';
    }

    if (!putExtra.fname) {
        putExtra.fname = options.key || '?';
    }

    if (!putExtra.version) {
        putExtra.version = 'v1';
    }

    if (putExtra.resumeRecordFile) {
        const parsedPath = path.parse(path.resolve(putExtra.resumeRecordFile));
        putExtra.resumeRecorder = createResumeRecorderSync(parsedPath.dir);
        putExtra.resumeKey = parsedPath.base;
    }

    return putExtra;
}

/**
 * @class
 * @param {string} baseDirPath
 * @constructor
 */
function JsonFileRecorder (baseDirPath) {
    this.baseDirPath = baseDirPath;
}

/**
 * @param {string} key
 * @param {Object.<string, any>} data
 */
JsonFileRecorder.prototype.setSync = function (key, data) {
    const filePath = path.join(this.baseDirPath, key);
    const contents = JSON.stringify(data);
    fs.writeFileSync(
        filePath,
        contents,
        {
            encoding: 'utf-8',
            mode: 0o600
        }
    );
};

/**
 * @param key
 * @returns {undefined | Object.<string, any>}
 */
JsonFileRecorder.prototype.getSync = function (key) {
    let result;
    try {
        const filePath = path.join(this.baseDirPath, key);
        const recordContent = fs.readFileSync(
            filePath,
            {
                encoding: 'utf-8'
            }
        ).toString();
        result = JSON.parse(recordContent);
    } catch (_err) {
        // pass
    }
    return result;
};

JsonFileRecorder.prototype.hasSync = function (key) {
    try {
        const filePath = path.join(this.baseDirPath, key);
        return fs.existsSync(filePath);
    } catch (_err) {
        return false;
    }
};

JsonFileRecorder.prototype.deleteSync = function (key) {
    try {
        const filePath = path.join(this.baseDirPath, key);
        fs.unlinkSync(filePath);
    } catch (_err) {
        // pass
    }
};

/**
 * @param {Object} options
 * @param {string[]} options.hosts
 * @param {string} options.accessKey
 * @param {string} options.bucketName
 * @param {string} options.key
 * @param {string} options.filePath
 * @param {string} options.version
 * @param {string} options.partSize
 * @returns {string | undefined}
 */
JsonFileRecorder.prototype.generateKeySync = function (options) {
    // if some options not pass in, can't generate a valid key
    if (
        [
            Array.isArray(options.hosts),
            options.accessKey,
            options.bucketName,
            options.key,
            options.filePath,
            options.version,
            options.partSize
        ].some(v => !v)
    ) {
        return;
    }

    let fileStats;
    try {
        fileStats = options.filePath && fs.statSync(options.filePath);
    } catch (_err) {
        return;
    }

    const fields = [
        options.hosts.join(''),
        options.accessKey,
        options.bucketName,
        options.key || '',
        options.filePath,
        // use `stats.mtimeMs` when min version of Node.js update to ≥ v8.1.0
        fileStats ? fileStats.mtime.getTime().toString() : '',
        fileStats ? fileStats.size.toString() : '',
        options.version, // the upload version
        options.version === 'v1'
            ? conf.BLOCK_SIZE.toString()
            : options.partSize.toString(),
        'json.v1' // the record file format version
    ];
    const h = crypto.createHash('sha1');
    fields.forEach(v => {
        h.update(v);
    });
    return `qn-resume-${h.digest('hex')}.json`;
};

function createResumeRecorder (baseDirPath) {
    if (baseDirPath) {
        // make baseDirPath absolute
        baseDirPath = path.resolve(baseDirPath);
    } else {
        // set default baseDirPath to os temp
        baseDirPath = os.tmpdir();
    }
    // with mkdirp on Windows the root-level ENOENT errors can lead to infinite regress
    // remove the fs.access when instead mkdirp with the native option `recursive`
    return new Promise((resolve, reject) => {
        fs.access(
            path.parse(baseDirPath).root,
            fs.constants.R_OK | fs.constants.W_OK,
            err => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            }
        );
    })
        .then(() => new Promise((resolve, reject) => {
            mkdirp(baseDirPath, { mode: 0o700 }, err => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        }))
        .then(() => new JsonFileRecorder(baseDirPath));
}

function createResumeRecorderSync (baseDirPath) {
    if (baseDirPath) {
        // make baseDirPath absolute
        baseDirPath = path.resolve(baseDirPath);
    } else {
        // set default baseDirPath to os temp
        baseDirPath = os.tmpdir();
    }
    // with mkdirp on Windows the root-level ENOENT errors can lead to infinite regress
    // remove the fs.access when instead mkdirp with the native option `recursive`
    fs.accessSync(
        path.parse(baseDirPath).root,
        fs.constants.F_OK
    );
    mkdirp.sync(baseDirPath, { mode: 0o700 });
    return new JsonFileRecorder(baseDirPath);
}
