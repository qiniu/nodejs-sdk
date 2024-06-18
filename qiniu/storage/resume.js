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
 * @param {boolean} [options.retryable]
 * @param {'v1' | 'v2' | string} [options.uploadApiVersion]
 * @param {JsonFileRecorder} [options.resumeRecorder]
 * @param {string} [options.resumeKey]
 */
function _getRegionsRetrier (options) {
    const {
        bucketName,
        accessKey,
        retryable = true,

        uploadApiVersion,
        resumeRecorder,
        resumeKey
    } = options;

    const preferredScheme = this.config.useHttpsDomain ? 'https' : 'http';
    let preferredEndpoints;
    const isResumeAvailable = Boolean(resumeRecorder && resumeKey);
    if (isResumeAvailable) {
        const resumeInfo = resumeRecorder.getSync(resumeKey);
        if (resumeInfo && Array.isArray(resumeInfo.upDomains)) {
            preferredEndpoints = resumeInfo.upDomains.map(d =>
                new Endpoint(d, { defaultScheme: preferredScheme }));
        }
    }

    return this.config.getRegionsProvider({
        bucketName,
        accessKey
    })
        .then(regionsProvider => {
            const serviceNames = this.config.accelerateUploading
                ? [SERVICE_NAME.UP_ACC, SERVICE_NAME.UP]
                : [SERVICE_NAME.UP];
            const retryPolicies = [
                new AccUnavailableRetryPolicy(),
                new TokenExpiredRetryPolicy({
                    uploadApiVersion,
                    recordExistsHandler: () => {
                        if (!isResumeAvailable) {
                            return;
                        }
                        resumeRecorder.hasSync(resumeKey);
                    },
                    recordDeleteHandler: () => {
                        if (!isResumeAvailable) {
                            return;
                        }
                        resumeRecorder.deleteSync(resumeKey);
                    }
                }),
                new EndpointsRetryPolicy({
                    skipInitContext: true
                }),
                new RegionsRetryPolicy({
                    regionsProvider,
                    serviceNames,
                    onChangedRegion: () => {
                        if (!isResumeAvailable) {
                            return;
                        }
                        resumeRecorder.deleteSync(resumeKey);
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
                        return retryable;
                    }
                    if (policy instanceof AccUnavailableRetryPolicy) {
                        return true;
                    }
                    return retryable && context.result && context.result.needRetry();
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

    // Why need retrier even if retryable is false?
    // Because the retrier is used to get the endpoints,
    // which will be initialed by region policy.
    const result = _getRegionsRetrier.call(this, {
        bucketName: util.getBucketFromUptoken(uploadToken),
        accessKey: util.getAKFromUptoken(uploadToken),
        retryable: false

        // useless by not retryable
        // uploadApiVersion: putExtra.version,
    })
        .then(retrier => Promise.all([
            retrier,
            retrier.initContext()
        ]))
        .then(([retrier, context]) => retrier.retry({
            func: context => putReq(
                context.endpoint,
                preferredScheme,
                uploadToken,
                key,
                rsStream,
                rsStreamLen,
                putExtra
            ),
            context
        }));

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
    console.log('action debug: request endpoint', upEndpoint);

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

    const akFromToken = util.getAKFromUptoken(uploadToken);
    const bucketFromToken = util.getBucketFromUptoken(uploadToken);
    putExtra = getDefaultPutExtra(
        putExtra,
        {
            accessKey: akFromToken,
            bucketName: bucketFromToken,
            key,
            filePath: localFile
        }
    );

    const result = _getRegionsRetrier.call(this, {
        accessKey: akFromToken,
        bucketName: bucketFromToken,

        uploadApiVersion: putExtra.version,
        resumeRecorder: putExtra.resumeRecorder,
        resumeKey: putExtra.resumeKey
    })
        .then(retrier => Promise.all([
            retrier,
            retrier.initContext()
        ]))
        .then(([retrier, context]) => retrier.retry({
            func: context => {
                const rsStream = fs.createReadStream(localFile, {
                    highWaterMark: conf.BLOCK_SIZE
                });
                const rsStreamLen = fs.statSync(localFile).size;
                const p = putReq(
                    context.endpoint,
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
 * @param {string} [options.accessKey]
 * @param {string} [options.bucketName]
 * @param {string | null} [options.key]
 * @param {string} [options.filePath]
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
        putExtra.resumeKey = parsedPath.name;
    }

    // generate `resumeKey` if not exists
    if (
        putExtra.resumeRecorder &&
        !putExtra.resumeKey &&
        options.filePath &&
        options.accessKey &&
        options.bucketName
    ) {
        let fileLastModify;
        try {
            fileLastModify = options.filePath && fs.statSync(options.filePath).mtimeMs.toString();
        } catch (_err) {
            fileLastModify = '';
        }
        const recordValuesToHash = [
            putExtra.version,
            options.accessKey,
            `${options.bucketName}:${options.key}`,
            options.filePath,
            fileLastModify
        ];
        putExtra.resumeKey = putExtra.resumeRecorder.generateKey(recordValuesToHash);
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
    const filePath = path.join(this.baseDirPath, key);
    let result;
    try {
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
    const filePath = path.join(this.baseDirPath, key);
    try {
        return fs.existsSync(filePath);
    } catch (_err) {
        return false;
    }
};

JsonFileRecorder.prototype.deleteSync = function (key) {
    const filePath = path.join(this.baseDirPath, key);
    try {
        fs.unlinkSync(filePath);
    } catch (_err) {
        // pass
    }
};

JsonFileRecorder.prototype.generateKey = function (fields) {
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
