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

function ResumeUploader(config) {
    this.config = config || new conf.Config();
}

// 上传可选参数
// @params fname                      请求体中的文件的名称
// @params params                     额外参数设置，参数名称必须以x:开头
// @param mimeType                    指定文件的mimeType
// @param resumeRecordFile            断点续传的已上传的部分信息记录文件
// @param progressCallback(uploadBytes, totalBytes) 上传进度回调
// @param partSize                    分片上传v2必传字段 默认大小为4MB 分片大小范围为1 MB - 1 GB
// @param version                     分片上传版本 目前支持v1/v2版本 默认v1
// @param metadata                    元数据设置，参数名称必须以 x-qn-meta-${name}: 开头
function PutExtra(fname, params, mimeType, resumeRecordFile, progressCallback, partSize,
                   version, metadata) {
    this.fname = fname || '';
    this.params = params || {};
    this.mimeType = mimeType || null;
    this.resumeRecordFile = resumeRecordFile || null;
    this.progressCallback = progressCallback || null;
    this.partSize = partSize || conf.BLOCK_SIZE;
    this.version = version || 'v1';
    this.metadata = metadata || {};
}

ResumeUploader.prototype.putStream = function (uploadToken, key, rsStream,
    rsStreamLen, putExtra, callbackFunc) {
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

    var accessKey = util.getAKFromUptoken(uploadToken);
    var bucket = util.getBucketFromUptoken(uploadToken);

    util.prepareZone(this, accessKey, bucket, function (err, ctx) {
        if (err) {
            callbackFunc(err, null, null);
            destroy(rsStream);
            return;
        }
        putReq(ctx.config, uploadToken, key, rsStream, rsStreamLen, putExtra, callbackFunc);
    });
};

function putReq(config, uploadToken, key, rsStream, rsStreamLen, putExtra, callbackFunc) {
    // set up hosts order
    var upHosts = [];

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

    var scheme = config.useHttpsDomain ? 'https://' : 'http://';
    var upDomain = scheme + upHosts[0];
    // block upload

    var blkStream = rsStream.pipe(new BlockStream({
        size: putExtra.partSize,
        zeroPadding: false
    }));

    var readLen = 0;
    var curBlock = 0;
    var finishedBlock = 0;
    var finishedCtxList = [];
    var finishedBlkPutRets = [];
    var isSent = false;
    var blkputRets = null;
    var totalBlockNum = Math.ceil(rsStreamLen / putExtra.partSize);
    var finishedEtags = {
        etags: [],
        uploadId: '',
        expiredAt: 0
    };
    // read resumeRecordFile
    if (putExtra.resumeRecordFile) {
        try {
            var resumeRecords = fs.readFileSync(putExtra.resumeRecordFile).toString();
            blkputRets = JSON.parse(resumeRecords);
        } catch (e) {
            console.error(e);
        }
        if (blkputRets !== null) {
            if (putExtra.version === 'v1') {
                for (var index = 0; index < blkputRets.length; index++) {
                    // check ctx expired or not
                    var blkputRet = blkputRets[index];
                    var expiredAt = blkputRet.expired_at;
                    // make sure the ctx at least has one day expiration
                    expiredAt += 3600 * 24;
                    if (util.isTimestampExpired(expiredAt)) {
                        // discard these ctxs
                        break;
                    }
                    finishedBlock += 1;
                    finishedCtxList.push(blkputRet.ctx);
                    finishedBlkPutRets.push(blkputRet);
                }
            } else if (putExtra.version === 'v2') {
                // check etag expired or not
                var expiredAt = blkputRets.expiredAt;
                var timeNow = new Date() / 1000;
                if (expiredAt > timeNow && blkputRets.uploadId !== '') {
                    finishedEtags.etags = blkputRets.etags;
                    finishedEtags.uploadId = blkputRets.uploadId;
                    finishedEtags.expiredAt = blkputRets.expiredAt;
                    finishedBlock = finishedEtags.etags.length;
                }
            } else {
                throw new Error('part upload version number error');
            }
        }
    }

    var bucket = util.getBucketFromUptoken(uploadToken);
    if (putExtra.version === 'v1') {
        // check when to mkblk
        blkStream.on('data', function (chunk) {
            readLen += chunk.length;
            curBlock += 1; // set current block
            if (curBlock > finishedBlock) {
                blkStream.pause();
                mkblkReq(upDomain, uploadToken, chunk, function (respErr,
                                                                 respBody,
                                                                 respInfo) {
                    var bodyCrc32 = parseInt('0x' + getCrc32(chunk));
                    if (respInfo.statusCode !== 200 || respBody.crc32 !== bodyCrc32) {
                        callbackFunc(respErr, respBody, respInfo);
                        destroy(rsStream);
                    } else {
                        finishedBlock += 1;
                        var blkputRet = respBody;
                        finishedCtxList.push(blkputRet.ctx);
                        finishedBlkPutRets.push(blkputRet);
                        if (putExtra.resumeRecordFile) {
                            var contents = JSON.stringify(finishedBlkPutRets);
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

    } else if (putExtra.version === 'v2') {
        var encodedObjectName = key ? util.urlsafeBase64Encode(key) : '~';
        if (finishedEtags.uploadId) {
            // if it has resumeRecordFile
            resumeUploadV2(uploadToken, bucket, encodedObjectName, upDomain, blkStream, isSent, readLen, curBlock,
                finishedEtags, finishedBlock, totalBlockNum, putExtra, rsStreamLen, rsStream, callbackFunc);
        } else {
            // init an new uploadId for next step
            initReq(uploadToken, bucket, encodedObjectName, upDomain, blkStream, isSent, readLen, curBlock,
                finishedEtags, finishedBlock, totalBlockNum, putExtra, rsStreamLen, rsStream, callbackFunc);
        }
    } else {
        throw new Error('part upload version number error');
    }
}

function mkblkReq(upDomain, uploadToken, blkData, callbackFunc) {
    var requestURI = upDomain + '/mkblk/' + blkData.length;
    var auth = 'UpToken ' + uploadToken;
    var headers = {
        Authorization: auth,
        'Content-Type': 'application/octet-stream'
    };
    rpc.post(requestURI, blkData, headers, callbackFunc);
}

function mkfileReq(upDomain, uploadToken, fileSize, ctxList, key, putExtra,
    callbackFunc) {
    var requestURI = upDomain + '/mkfile/' + fileSize;
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
        for (var k in putExtra.params) {
            if (k.startsWith('x:') && putExtra.params[k]) {
                requestURI += '/' + k + '/' + util.urlsafeBase64Encode(putExtra.params[
                    k].toString());
            }
        }
    }

    // putExtra metadata
    if (putExtra.metadata) {
        for (var metadataKey in putExtra.metadata) {
            if (metadataKey.startsWith('x-qn-meta-') && putExtra.metadata[metadataKey]) {
                requestURI +=
                    '/' + metadataKey + '/' +
                    util.urlsafeBase64Encode(putExtra.metadata[metadataKey].toString());
            }
        }
    }

    var auth = 'UpToken ' + uploadToken;
    var headers = {
        Authorization: auth,
        'Content-Type': 'application/octet-stream'
    };
    var postBody = ctxList.join(',');
    rpc.post(requestURI, postBody, headers, function (err, ret, info) {
        if (info.statusCode === 200 || info.statusCode === 701 || info.statusCode === 401) {
            if (putExtra.resumeRecordFile) {
                fs.unlinkSync(putExtra.resumeRecordFile);
            }
        }
        callbackFunc(err, ret, info);
    });
}

function initReq(uploadToken, bucket, encodedObjectName, upDomain, blkStream, isSent, readLen, curBlock, finishedEtags,
                 finishedBlock, totalBlockNum, putExtra, rsStreamLen, rsStream, callbackFunc) {
    var requestUrl = upDomain + '/buckets/' + bucket + '/objects/' + encodedObjectName + '/uploads';
    var headers = {
        Authorization: 'UpToken ' + uploadToken,
        'Content-Type': 'application/json'
    };
    rpc.post(requestUrl, '', headers, function (err, ret, info) {
        if (info.statusCode !== 200) {
            callbackFunc(err, ret, info);
        }
        finishedEtags.expiredAt = ret.expireAt;
        finishedEtags.uploadId = ret.uploadId;
        resumeUploadV2(uploadToken, bucket, encodedObjectName, upDomain, blkStream, isSent, readLen, curBlock,
            finishedEtags, finishedBlock, totalBlockNum, putExtra, rsStreamLen, rsStream, callbackFunc);
    });
}

function resumeUploadV2(uploadToken, bucket, encodedObjectName, upDomain, blkStream, isSent, readLen, curBlock, finishedEtags,
                       finishedBlock, totalBlockNum, putExtra, rsStreamLen, rsStream, callbackFunc) {
    blkStream.on('data', function (chunk) {
        var partNumber = 0;
        readLen += chunk.length;
        curBlock += 1; // set current block
        if (curBlock > finishedBlock) {
            blkStream.pause();
            partNumber = finishedBlock + 1;
            var bodyMd5 = util.getMd5(chunk);
            uploadPart(bucket, upDomain, uploadToken, encodedObjectName, chunk, finishedEtags.uploadId, partNumber,
                function (respErr, respBody, respInfo) {
                    if (respInfo.statusCode !== 200 || respBody.md5 !== bodyMd5) {
                        callbackFunc(respErr, respBody, respInfo);
                        destroy(rsStream);
                    } else {
                        finishedBlock += 1;
                        var blkputRet = respBody;
                        var blockStatus = {
                            etag: blkputRet.etag,
                            partNumber: partNumber
                        };
                        finishedEtags.etags.push(blockStatus);
                        if (putExtra.resumeRecordFile) {
                            var contents = JSON.stringify(finishedEtags);
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

function uploadPart(bucket, upDomain, uploadToken, encodedObjectName, chunk, uploadId, partNumber, callbackFunc) {
    var headers = {
        Authorization: 'UpToken ' + uploadToken,
        'Content-Type': 'application/octet-stream',
        'Content-MD5': util.getMd5(chunk)
    };
    var requestUrl = upDomain + '/buckets/' + bucket + '/objects/' + encodedObjectName + '/uploads/' + uploadId;
    requestUrl += '/' + partNumber.toString();
    rpc.put(requestUrl, chunk, headers, callbackFunc);
}

function completeParts(upDomain, bucket, encodedObjectName, uploadToken, finishedEtags,
    putExtra, callbackFunc) {
    var headers = {
        Authorization: 'UpToken ' + uploadToken,
        'Content-Type': 'application/json'
    };
    var sortedParts = finishedEtags.etags.sort(function (a, b) {
        return a.partNumber - b.partNumber;
    });
    var body = {
        'fname': putExtra.fname,
        'mimeType': putExtra.mimeType,
        'customVars': putExtra.params,
        'metadata': putExtra.metadata,
        'parts': sortedParts
    };
    var requestUrl = upDomain + '/buckets/' + bucket + '/objects/' + encodedObjectName + '/uploads/' + finishedEtags.uploadId;
    var requestBody = JSON.stringify(body);
    rpc.post(requestUrl, requestBody, headers, function (err, ret, info) {
        if (info.statusCode !== 200) {
            if (putExtra.resumeRecordFile) {
                fs.unlinkSync(putExtra.resumeRecordFile);
            }
        }
        callbackFunc(err, ret, info);
    });
}


ResumeUploader.prototype.putFile = function (uploadToken, key, localFile,
    putExtra, callbackFunc) {
    putExtra = putExtra || new PutExtra();
    var rsStream = fs.createReadStream(localFile, {
        highWaterMark: conf.BLOCK_SIZE
    });
    var rsStreamLen = fs.statSync(localFile).size;
    if (!putExtra.mimeType) {
        putExtra.mimeType = mime.getType(localFile);
    }

    if (!putExtra.fname) {
        putExtra.fname = path.basename(localFile);
    }

    return this.putStream(uploadToken, key, rsStream, rsStreamLen, putExtra,
        callbackFunc);
};

ResumeUploader.prototype.putFileWithoutKey = function (uploadToken, localFile,
    putExtra, callbackFunc) {
    return this.putFile(uploadToken, null, localFile, putExtra, callbackFunc);
};
