const conf = require('../conf');
const util = require('../util');
const rpc = require('../rpc');
const path = require('path');
const mime = require('mime');
const fs = require('fs');
const getCrc32 = require('crc32');
const destroy = require('destroy');
const BlockStream = require('block-stream2');

exports.ResumeUploader = ResumeUploader;
exports.PutExtra = PutExtra;

function ResumeUploader (config) {
    this.config = config || new conf.Config();
}

/**
 * @callback reqCallback
 *
 * @param { Error } err
 * @param { Object } ret
 * @param { http.IncomingMessage } info
 */

/**
 * @callback progressCallback
 *
 * @param { number } uploadBytes
 * @param { number } totalBytes
 */

/**
  * 上传可选参数
  * @param { string } fname                      请求体中的文件的名称
  * @param { Object } params                     额外参数设置，参数名称必须以x:开头
  * @param { string | null } mimeType            指定文件的mimeType
  * @param { string | null } resumeRecordFile    断点续传的已上传的部分信息记录文件路径
  * @param { progressCallback } progressCallback 上传进度回调，回调参数为 (uploadBytes, totalBytes)
  * @param { number } partSize                   分片上传v2必传字段 默认大小为4MB 分片大小范围为1 MB - 1 GB
  * @param { 'v1' | 'v2' } version               分片上传版本 目前支持v1/v2版本 默认v1
  * @param { Object } metadata                   元数据设置，参数名称必须以 x-qn-meta-${name}: 开头
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

ResumeUploader.prototype.putStream = function (
    uploadToken,
    key,
    rsStream,
    rsStreamLen,
    putExtra,
    callbackFunc
) {
    putExtra = putExtra || new PutExtra();
    if (!putExtra.mimeType) {
        putExtra.mimeType = 'application/octet-stream';
    }

    if (!putExtra.fname) {
        putExtra.fname = key || '?';
    }

    if (!putExtra.version) {
        putExtra.version = 'v1';
    }

    rsStream.on('error', function (err) {
    // callbackFunc
        callbackFunc(err, null, null);
        destroy(rsStream);
    });

    const accessKey = util.getAKFromUptoken(uploadToken);
    const bucket = util.getBucketFromUptoken(uploadToken);

    util.prepareZone(this, accessKey, bucket, function (err, ctx) {
        if (err) {
            callbackFunc(err, null, null);
            destroy(rsStream);
            return;
        }
        putReq(ctx.config, uploadToken, key, rsStream, rsStreamLen, putExtra, callbackFunc);
    });
};

function putReq (config, uploadToken, key, rsStream, rsStreamLen, putExtra, callbackFunc) {
    // set up hosts order
    const upHosts = [];
    if (config.useCdnDomain) {
        if (config.zone.cdnUpHosts) {
            config.zone.cdnUpHosts.forEach(function (host) {
                upHosts.push(host);
            });
        }
        config.zone.srcUpHosts.forEach(function (host) {
            upHosts.push(host);
        });
    } else {
        config.zone.srcUpHosts.forEach(function (host) {
            upHosts.push(host);
        });
        config.zone.cdnUpHosts.forEach(function (host) {
            upHosts.push(host);
        });
    }
    const scheme = config.useHttpsDomain ? 'https://' : 'http://';
    const upDomain = scheme + upHosts[0];

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

    // upload parts
    if (putExtra.version === 'v1') {
        putReqV1(
            {
                blkputRets,
                rsStream,
                rsStreamLen,
                blkStream,
                totalBlockNum
            },
            {
                key,
                upDomain,
                uploadToken,
                putExtra
            },
            callbackFunc
        );
    } else if (putExtra.version === 'v2') {
        putReqV2(
            {
                blkputRets,
                blkStream,
                totalBlockNum,
                rsStreamLen,
                rsStream
            },
            {
                upDomain,
                uploadToken,
                key,
                putExtra
            },
            callbackFunc
        );
    } else {
        throw new Error('part upload version number error');
    }
}

/**
 * @param { Object } sourceOptions
 * @param { Object[] | null } sourceOptions.blkputRets
 * @param { ReadableStream } sourceOptions.rsStream
 * @param { BlockStream } sourceOptions.blkStream
 * @param { number } sourceOptions.rsStreamLen
 * @param { number } sourceOptions.totalBlockNum
 * @param { Object } uploadOptions
 * @param { string } uploadOptions.key
 * @param { string } uploadOptions.upDomain
 * @param { string } uploadOptions.uploadToken
 * @param { PutExtra } uploadOptions.putExtra
 * @param { reqCallback } callbackFunc
 */
function putReqV1 (sourceOptions, uploadOptions, callbackFunc) {
    const {
        blkputRets,
        rsStream,
        blkStream,
        rsStreamLen,
        totalBlockNum
    } = sourceOptions;
    const {
        key,
        upDomain,
        uploadToken,
        putExtra
    } = uploadOptions;

    // initial state
    const finishedCtxList = [];
    const finishedBlkPutRets = [];

    // upload parts
    let readLen = 0;
    let curBlock = 0;
    let isSent = false;
    blkStream.on('data', function (chunk) {
        readLen += chunk.length;
        let needUploadBlk = true;
        // check uploaded parts
        if (blkputRets && blkputRets.length > 0 && blkputRets[curBlock]) {
            const blkputRet = blkputRets[curBlock];
            let expiredAt = blkputRet.expired_at;
            // make sure the ctx at least has one day expiration
            expiredAt += 3600 * 24;
            if (!util.isTimestampExpired(expiredAt)) {
                needUploadBlk = false;
                finishedCtxList.push(blkputRet.ctx);
                finishedBlkPutRets.push(blkputRet);
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
                        finishedBlkPutRets.push(blkputRet);
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
 * @param { Object } sourceOptions
 * @param { Object | null } sourceOptions.blkputRets
 * @param { ReadableStream } sourceOptions.rsStream
 * @param { BlockStream } sourceOptions.blkStream
 * @param { number } sourceOptions.rsStreamLen
 * @param { number } sourceOptions.totalBlockNum
 * @param { Object } uploadOptions
 * @param { string } uploadOptions.key
 * @param { string } uploadOptions.upDomain
 * @param { string } uploadOptions.uploadToken
 * @param { PutExtra } uploadOptions.putExtra
 * @param { reqCallback } callbackFunc
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
        upDomain,
        putExtra
    } = uploadOptions;

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

function mkblkReq (upDomain, uploadToken, blkData, callbackFunc) {
    const requestURI = upDomain + '/mkblk/' + blkData.length;
    const auth = 'UpToken ' + uploadToken;
    const headers = {
        Authorization: auth,
        'Content-Type': 'application/octet-stream'
    };
    rpc.post(requestURI, blkData, headers, callbackFunc);
}

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
    rpc.post(requestURI, postBody, headers, function (err, ret, info) {
        if (info.statusCode === 200 || info.statusCode === 701) {
            if (putExtra.resumeRecordFile) {
                try {
                    fs.unlinkSync(putExtra.resumeRecordFile);
                } catch (_e) {
                    // ignore
                }
            }
        }
        callbackFunc(err, ret, info);
    });
}

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

function uploadPart (bucket, upDomain, uploadToken, encodedObjectName, chunk, uploadId, partNumber, putExtra, callbackFunc) {
    const headers = {
        Authorization: 'UpToken ' + uploadToken,
        'Content-Type': 'application/octet-stream',
        'Content-MD5': util.getMd5(chunk)
    };
    const requestUrl = upDomain + '/buckets/' + bucket + '/objects/' + encodedObjectName + '/uploads/' + uploadId +
        '/' + partNumber.toString();
    rpc.put(requestUrl, chunk, headers, function (err, ret, info) {
        if (info.statusCode === 612) {
            if (putExtra.resumeRecordFile) {
                try {
                    fs.unlinkSync(putExtra.resumeRecordFile);
                } catch (_e) {
                    // ignore
                }
            }
        }
        callbackFunc(err, ret, info);
    });
}

function completeParts (upDomain, bucket, encodedObjectName, uploadToken, finishedEtags,
    putExtra, callbackFunc) {
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
    rpc.post(requestUrl, requestBody, headers, function (err, ret, info) {
        if (info.statusCode === 200 || info.statusCode === 612) {
            if (putExtra.resumeRecordFile) {
                try {
                    fs.unlinkSync(putExtra.resumeRecordFile);
                } catch (_e) {
                    // ignore
                }
            }
        }
        callbackFunc(err, ret, info);
    });
}

ResumeUploader.prototype.putFile = function (
    uploadToken,
    key,
    localFile,
    putExtra,
    callbackFunc
) {
    const that = this;
    putExtra = putExtra || new PutExtra();
    const rsStream = fs.createReadStream(localFile, {
        highWaterMark: conf.BLOCK_SIZE
    });
    const rsStreamLen = fs.statSync(localFile).size;
    const isResumeUpload = putExtra.resumeRecordFile &&
        fs.existsSync(putExtra.resumeRecordFile);
    if (!putExtra.mimeType) {
        putExtra.mimeType = mime.getType(localFile);
    }

    if (!putExtra.fname) {
        putExtra.fname = path.basename(localFile);
    }

    return this.putStream(uploadToken, key, rsStream, rsStreamLen, putExtra,
        callbackWithRetryFunc);

    function callbackWithRetryFunc (err, ret, info) {
        let needRetry = false;
        if (putExtra.version === 'v1' &&
            info.statusCode === 701 &&
            isResumeUpload
        ) {
            needRetry = true;
        }
        if (putExtra.version === 'v2' &&
            info.statusCode === 612 &&
            isResumeUpload
        ) {
            needRetry = true;
        }
        if (needRetry) {
            that.putFile(
                uploadToken,
                key,
                localFile,
                putExtra,
                callbackFunc
            );
            return;
        }
        callbackFunc(err, ret, info);
    }
};

ResumeUploader.prototype.putFileWithoutKey = function (uploadToken, localFile,
    putExtra, callbackFunc) {
    return this.putFile(uploadToken, null, localFile, putExtra, callbackFunc);
};
