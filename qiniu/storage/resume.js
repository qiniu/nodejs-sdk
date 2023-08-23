const fs = require('fs');
const path = require('path');

const mime = require('mime');
const getCrc32 = require('crc32');
const destroy = require('destroy');
const BlockStream = require('block-stream2');

const conf = require('../conf');
const util = require('../util');
const rpc = require('../rpc');

const {
    prepareRegionsProvider,
    doWorkWithRetry,
    TokenExpiredRetryPolicy,
    ChangeEndpointRetryPolicy,
    ChangeRegionRetryPolicy
} = require('./internal');

exports.ResumeUploader = ResumeUploader;
exports.PutExtra = PutExtra;

/**
 * @param {conf.Config} [config]
 * @constructor
 */
function ResumeUploader (config) {
    this.config = config || new conf.Config();

    /**
     * Internal usage only for now.
     * @readonly
     */
    this.retryPolicies = [
        new TokenExpiredRetryPolicy(),
        new ChangeEndpointRetryPolicy(),
        new ChangeRegionRetryPolicy()
    ];
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
 * @param {string} [fname]                      请求体中的文件的名称
 * @param {Object} [params]                     额外参数设置，参数名称必须以x:开头
 * @param {string | null} [mimeType]            指定文件的mimeType
 * @param {string | null} [resumeRecordFile]    断点续传的已上传的部分信息记录文件路径
 * @param {function(number, number):void} [progressCallback] 上传进度回调，回调参数为 (uploadBytes, totalBytes)
 * @param {number} [partSize]                   分片上传v2必传字段 默认大小为4MB 分片大小范围为1 MB - 1 GB
 * @param {'v1' | 'v2'} [version]               分片上传版本 目前支持v1/v2版本 默认v1
 * @param {Object} [metadata]                   元数据设置，参数名称必须以 x-qn-meta-${name}: 开头
 */
function PutExtra (
    fname,
    params,
    mimeType,
    resumeRecordFile,
    progressCallback,
    partSize,
    version,
    metadata
) {
    this.fname = fname || '';
    this.params = params || {};
    this.mimeType = mimeType || null;
    this.resumeRecordFile = resumeRecordFile || null;
    this.progressCallback = progressCallback || null;
    this.partSize = partSize || conf.BLOCK_SIZE;
    this.version = version || 'v1';
    this.metadata = metadata || {};
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
 * @param {reqCallback} callbackFunc
 * @return {Promise<UploadResult>}
 */
ResumeUploader.prototype.putStream = function (
    uploadToken,
    key,
    rsStream,
    rsStreamLen,
    putExtra,
    callbackFunc
) {
    const preferScheme = this.config.useHttpsDomain ? 'https' : 'http';
    const isValidCallback = typeof callbackFunc === 'function';

    putExtra = getDefaultPutExtra(
        putExtra,
        {
            key
        }
    );

    rsStream.on('error', function (err) {
        // callbackFunc
        isValidCallback && callbackFunc(err, null, null);
        destroy(rsStream);
    });

    const regionsProvider = prepareRegionsProvider({
        config: this.config,
        bucketName: util.getBucketFromUptoken(uploadToken),
        accessKey: util.getAKFromUptoken(uploadToken)
    });

    return doWorkWithRetry({
        workFn: sendPutReq,

        callbackFunc,
        regionsProvider,
        // stream not support retry
        retryPolicies: []
    });

    function sendPutReq (endpoint) {
        const endpointValue = endpoint.getValue({
            scheme: preferScheme
        });
        return new Promise(resolve => {
            putReq(
                endpointValue,
                uploadToken,
                key,
                rsStream,
                rsStreamLen,
                putExtra,
                (err, ret, info) => resolve({ err, ret, info }));
        });
    }
};

/**
 * @param {string} upDomain
 * @param {string} uploadToken
 * @param {string | null} key
 * @param {ReadableStream} rsStream
 * @param {number} rsStreamLen
 * @param {PutExtra} putExtra
 * @param {reqCallback} callbackFunc
 */
function putReq (
    upDomain,
    uploadToken,
    key,
    rsStream,
    rsStreamLen,
    putExtra,
    callbackFunc
) {
    // make block stream
    const blkStream = rsStream.pipe(new BlockStream({
        size: putExtra.partSize,
        zeroPadding: false
    }));

    // get resume record info
    let blkputRets = null;
    const totalBlockNum = Math.ceil(rsStreamLen / putExtra.partSize);
    // read resumeRecordFile
    if (putExtra.resumeRecordFile) {
        try {
            const resumeRecords = fs.readFileSync(putExtra.resumeRecordFile).toString();
            blkputRets = JSON.parse(resumeRecords);
        } catch (e) {
            console.error(e);
        }
    }

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
    doPutReq(
        {
            blkputRets,
            rsStream,
            rsStreamLen,
            blkStream,
            totalBlockNum
        },
        {
            upDomain,
            uploadToken,
            key,
            putExtra
        },
        function (err, ret, info) {
            if (info.statusCode === 200 && putExtra.resumeRecordFile) {
                try {
                    fs.unlinkSync(putExtra.resumeRecordFile);
                } catch (_e) {
                    // ignore
                }
            }
            callbackFunc(err, ret, info);
        }
    );
}

/**
 * @typedef SourceOptions
 * @property { Object[] | null } blkputRets
 * @property { ReadableStream } rsStream
 * @property { BlockStream } blkStream
 * @property { number } rsStreamLen
 * @property { number } totalBlockNum
 */

/**
 * @typedef UploadOptions
 * @property { string | null } key
 * @property { string } upDomain
 * @property { string } uploadToken
 * @property { PutExtra } putExtra
 */

/**
 * @param {SourceOptions} sourceOptions
 * @param {UploadOptions} uploadOptions
 * @param {reqCallback} callbackFunc
 * @returns { Promise<UploadResult> }
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
        key,
        uploadToken,
        putExtra
    } = uploadOptions;

    // use resume upDomain firstly
    const upDomain = (blkputRets && blkputRets.upDomain) || uploadOptions.upDomain;

    // initial state
    const finishedCtxList = [];
    const finishedBlkPutRets = {
        upDomain: upDomain,
        parts: []
    };

    // backward compatibility with ≤ 7.9.0
    if (Array.isArray(blkputRets)) {
        // TODO: Perhaps should restart instead of restore?
        blkputRets = {
            upDomain: upDomain,
            parts: blkputRets
        };
    }

    // upload parts
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
                        if (putExtra.resumeRecordFile) {
                            const contents = JSON.stringify(finishedBlkPutRets);
                            fs.writeFileSync(putExtra.resumeRecordFile, contents, {
                                encoding: 'utf-8'
                            });
                        }
                        if (putExtra.progressCallback) {
                            putExtra.progressCallback(readLen, rsStreamLen);
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
        if (!isSent && rsStreamLen === 0) {
            mkfileReq(upDomain, uploadToken, rsStreamLen, finishedCtxList, key, putExtra, callbackFunc);
        }
        destroy(rsStream);
    });
}

/**
 * @param {SourceOptions} sourceOptions
 * @param {UploadOptions} uploadOptions
 * @param {reqCallback} callbackFunc
 * @returns { Promise<UploadResult> }
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
        uploadToken,
        key,
        putExtra
    } = uploadOptions;

    const upDomain = (blkputRets && blkputRets.upDomain) || uploadOptions.upDomain;

    // try resume upload blocks
    let finishedBlock = 0;
    const finishedEtags = {
        etags: [],
        uploadId: '',
        expiredAt: 0
    };
    if (blkputRets !== null) {
        // check etag expired or not
        const expiredAt = blkputRets.expiredAt;
        const timeNow = Date.now() / 1000;
        if (expiredAt > timeNow && blkputRets.uploadId !== '') {
            finishedEtags.etags = blkputRets.etags;
            finishedEtags.uploadId = blkputRets.uploadId;
            // TODO: Perhaps should restart instead of restore?
            finishedEtags.upDomain = upDomain;
            finishedEtags.expiredAt = blkputRets.expiredAt;
            finishedBlock = finishedEtags.etags.length;
        }
    }

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
                        if (putExtra.resumeRecordFile) {
                            const contents = JSON.stringify(finishedEtags);
                            fs.writeFileSync(putExtra.resumeRecordFile, contents, {
                                encoding: 'utf-8'
                            });
                        }
                        if (putExtra.progressCallback) {
                            putExtra.progressCallback(readLen, rsStreamLen);
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
 * @param {reqCallback} callbackFunc
 * @returns {Promise<UploadResult>}
 */
ResumeUploader.prototype.putFile = function (
    uploadToken,
    key,
    localFile,
    putExtra,
    callbackFunc
) {
    const preferScheme = this.config.useHttpsDomain ? 'https' : 'http';

    // PutExtra
    putExtra = putExtra || new PutExtra();
    if (!putExtra.mimeType) {
        putExtra.mimeType = mime.getType(localFile);
    }

    if (!putExtra.fname) {
        putExtra.fname = path.basename(localFile);
    }

    putExtra = getDefaultPutExtra(
        putExtra,
        {
            key
        }
    );

    // regions
    const regionsProvider = prepareRegionsProvider({
        config: this.config,
        bucketName: util.getBucketFromUptoken(uploadToken),
        accessKey: util.getAKFromUptoken(uploadToken)
    });

    return doWorkWithRetry({
        workFn: sendPutReq,

        callbackFunc,
        regionsProvider,
        retryPolicies: this.retryPolicies,
        uploadApiVersion: putExtra.version,
        resumeRecordFilePath: putExtra.resumeRecordFile
    });

    function sendPutReq (endpoint) {
        const rsStream = fs.createReadStream(localFile, {
            highWaterMark: conf.BLOCK_SIZE
        });
        const rsStreamLen = fs.statSync(localFile).size;
        const endpointValue = endpoint.getValue({
            scheme: preferScheme
        });
        return new Promise((resolve) => {
            putReq(
                endpointValue,
                uploadToken,
                key,
                rsStream,
                rsStreamLen,
                putExtra,
                (err, ret, info) => {
                    destroy(rsStream);
                    resolve({ err, ret, info });
                }
            );
        });
    }
};

/**
 * @param {string} uploadToken
 * @param {string} localFile
 * @param {PutExtra} putExtra
 * @param {reqCallback} callbackFunc
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
 * @return {PutExtra}
 */
function getDefaultPutExtra (putExtra, options) {
    options = options || {};

    putExtra = putExtra || new PutExtra();
    if (!putExtra.mimeType) {
        putExtra.mimeType = 'application/octet-stream';
    }

    if (!putExtra.fname) {
        putExtra.fname = options.key || '?';
    }

    if (!putExtra.version) {
        putExtra.version = 'v1';
    }

    return putExtra;
}
