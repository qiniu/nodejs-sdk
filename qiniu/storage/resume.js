const conf = require('../conf');
const zone = require('../zone');
const util = require('../util');
const rpc = require('../rpc');
const path = require('path');
const mime = require('mime');
const fs = require('fs');
const getCrc32 = require('crc32');

exports.ResumeUploader = ResumeUploader;
exports.PutExtra = PutExtra;

function ResumeUploader(config) {
  this.config = config || new conf.Config();
}

// 上传可选参数
// @params fname                      请求体中的文件的名称
// @params params                     额外参数设置，参数名称必须以x:开头
// @param mimeType                    指定文件的mimeType
// @param sliceSize                   指定文件的上传分片大小(默认4MB)
// @param resumeRecordFile            断点续传的已上传的部分信息记录文件
// @param progressCallback(uploadBytes, totalBytes) 上传进度回调
function PutExtra(fname, params, mimeType, resumeRecordFile, progressCallback) {
  this.fname = fname || '';
  this.params = params || {};
  this.mimeType = mimeType || null;
  this.resumeRecordFile = resumeRecordFile || null;
  this.progressCallback = progressCallback || null;
}

ResumeUploader.prototype.putStream = function(uploadToken, key, rsStream,
  rsStreamLen, putExtra, callbackFunc) {
  putExtra = putExtra || new PutExtra();
  if (!putExtra.mimeType) {
    putExtra.mimeType = 'application/octet-stream';
  }

  if (!putExtra.fname) {
    putExtra.fname = key ? key : '?';
  }

  rsStream.on("error", function(err) {
    //callbackFunc
    callbackFunc(err, null, null);
    return;
  });

  var useCache = false;
  var that = this;
  if (this.config.zone) {
    if (this.config.zoneExpire == -1) {
      useCache = true;
    } else {
      if (!util.isTimestampExpired(this.config.zoneExpire)) {
        useCache = true;
      }
    }
  }

  var accessKey = util.getAKFromUptoken(uploadToken);
  var bucket = util.getBucketFromUptoken(uploadToken);
  if (useCache) {
    putReq(this.config, uploadToken, key, rsStream, rsStreamLen, putExtra,
      callbackFunc);
  } else {
    zone.getZoneInfo(accessKey, bucket, function(err, cZoneInfo,
      cZoneExpire) {
      if (err) {
        callbackFunc(err, null, null);
        return;
      }

      //update object
      that.config.zone = cZoneInfo;
      that.config.zoneExpire = cZoneExpire;

      //req
      putReq(that.config, uploadToken, key, rsStream, rsStreamLen,
        putExtra,
        callbackFunc);
    });
  }
}

function putReq(config, uploadToken, key, rsStream, rsStreamLen, putExtra,
  callbackFunc) {
  //set up hosts order
  var upHosts = [];

  if (config.useCdnDomain) {
    if (config.zone.cdnUpHosts) {
      config.zone.cdnUpHosts.forEach(function(host) {
        upHosts.push(host);
      });
    }
    config.zone.srcUpHosts.forEach(function(host) {
      upHosts.push(host);
    });
  } else {
    config.zone.srcUpHosts.forEach(function(host) {
      upHosts.push(host);
    });
    config.zone.cdnUpHosts.forEach(function(host) {
      upHosts.push(host);
    });
  }

  var scheme = config.useHttpsDomain ? "https://" : "http://";
  var upDomain = scheme + upHosts[0];
  // block upload

  var fileSize = rsStreamLen;
  var sliceSize = putExtra.params.sliceSize || conf.BLOCK_SIZE;
  //console.log("file size:" + fileSize);
  var blockCnt = Math.round(fileSize / conf.BLOCK_SIZE);
  var totalBlockNum = (fileSize % conf.BLOCK_SIZE == 0) ? blockCnt : (blockCnt +
    1);
  var finishedBlock = 0;
  var curCtx = null;
  var curSliceOffset = 0;
  var curBlock = 0;
  var curBlockSize = conf.BLOCK_SIZE;
  var readLen = 0;
  var readBuffers = [];
  var finishedCtxList = [];
  var finishedBlkPutRets = [];
  //read resumeRecordFile
  if (putExtra.resumeRecordFile) {
    try {
      var resumeRecords = fs.readFileSync(putExtra.resumeRecordFile).toString();
      var blkputRets = JSON.parse(resumeRecords);

      for (var index = 0; index < blkputRets.length; index++) {
        //check ctx expired or not
        var blkputRet = blkputRets[index];
        var expiredAt = blkputRet.expired_at;
        //make sure the ctx at least has one day expiration
        expiredAt += 3600 * 24;
        if (util.isTimestampExpired(expiredAt)) {
          //discard these ctxs
          break;
        }

        finishedBlock += 1;
        finishedCtxList.push(blkputRet.ctx);
      }
    } catch (e) {}
  }

  var isEnd = rsStream._readableState.ended;
  var isSent = false;

  //check when to mkblk
  rsStream.on('data', function(chunk) {
    readLen += chunk.length;
    readBuffers.push(chunk);

    if (readLen % sliceSize == 0 || readLen == fileSize) {
      var readData = Buffer.concat(readBuffers);
      readBuffers = []; //reset read buffer

      if (curCtx === null) {
        curBlock += 1;
        if (curBlock === blockCnt + 1) {
          curBlockSize = fileSize % conf.BLOCK_SIZE;
        }
      }

      if (curBlock > finishedBlock) {
        rsStream.pause();
        blkReq(upDomain, uploadToken, curCtx, readData, curSliceOffset, curBlockSize, function(respErr,
          respBody,
          respInfo) {
          var bodyCrc32 = parseInt("0x" + getCrc32(readData));
          if (respInfo.statusCode != 200 || respBody.crc32 != bodyCrc32) {
            callbackFunc(respErr, respBody, respInfo);
            return;
          }
          if (putExtra.progressCallback) {
            putExtra.progressCallback(readLen, fileSize);
          }
          finishedBlkPutRets.push(respBody);
          curCtx = respBody.ctx;
          curSliceOffset = respBody.offset;
          rsStream.resume();

          // block upload finished
          if (curSliceOffset === curBlockSize) {
            if (putExtra.resumeRecordFile) {
              var contents = JSON.stringify(finishedBlkPutRets);
              console.log("write resume record " + putExtra.resumeRecordFile)
              fs.writeFileSync(putExtra.resumeRecordFile, contents, {
                encoding: 'utf-8'
              });
            }
            curCtx = null;
            curSliceOffset = 0;
            finishedBlock += 1;
            var blkputRet = respBody;
            finishedCtxList.push(blkputRet.ctx);

            if (isEnd  || finishedCtxList.length === Math.floor(totalBlockNum)) {
              mkfileReq(upDomain, uploadToken, fileSize, finishedCtxList, key, putExtra, callbackFunc);
              isSent = true;
            }
          }
        });
      }
    }
  });

  rsStream.on('end', function () {
    // 0B file won't trigger 'data' event
    if (!isSent && rsStreamLen === 0) {
      mkfileReq(upDomain, uploadToken, fileSize, finishedCtxList, key, putExtra, callbackFunc)
    }
  })
}

function blkReq(upDomain, uploadToken, ctx, bufferData, offset, blockSize, callbackFunc) {
  //console.log("mkblk");
  var requestURI;

  if (offset === 0) {
    requestURI = upDomain + "/mkblk/" + blockSize;
  } else {
    requestURI = upDomain + "/bput/" + ctx + "/" + offset;
  }
  var auth = 'UpToken ' + uploadToken;
  var headers = {
    'Authorization': auth,
    'Content-Type': 'application/octet-stream'
  }
  rpc.post(requestURI, bufferData, headers, callbackFunc);
}

function putsliceReq(upDomain, uploadToken, sliceData, chunkOffset, callbackFunc) {
  var requestURI = upDomain + "/bput/" + chunkOffset;
  var auth = 'UpToken ' + uploadToken;
  var headers = {
    'Authorization': auth,
    'Content-Type': 'application/octet-stream'
  }
  rpc.post(requestURI, sliceData, headers, callbackFunc);
}

function mkfileReq(upDomain, uploadToken, fileSize, ctxList, key, putExtra,
  callbackFunc) {
  //console.log("mkfile");
  var requestURI = upDomain + "/mkfile/" + fileSize;
  if (key) {
    requestURI += "/key/" + util.urlsafeBase64Encode(key);
  }
  if (putExtra.mimeType) {
    requestURI += "/mimeType/" + util.urlsafeBase64Encode(putExtra.mimeType);
  }
  if (putExtra.fname) {
    requestURI += "/fname/" + util.urlsafeBase64Encode(putExtra.fname);
  }
  if (putExtra.params) {
    //putExtra params
    for (var k in putExtra.params) {
      if (k.startsWith("x:") && putExtra.params[k]) {
        requestURI += "/" + k + "/" + util.urlsafeBase64Encode(putExtra.params[
          k].toString());
      }
    }
  }
  var auth = 'UpToken ' + uploadToken;
  var headers = {
    'Authorization': auth,
    'Content-Type': 'application/octet-stream'
  }
  var postBody = ctxList.join(",");
  rpc.post(requestURI, postBody, headers, function(err, ret, info) {
    if (info.statusCode == 200 || info.statusCode == 701 ||
      info.statusCode == 401) {
      if (putExtra.resumeRecordFile) {
        fs.unlinkSync(putExtra.resumeRecordFile);
      }
    }
    callbackFunc(err, ret, info);
  });
}

ResumeUploader.prototype.putFile = function(uploadToken, key, localFile,
  putExtra, callbackFunc) {
  putExtra = putExtra || new PutExtra();
  var rsStream = fs.createReadStream(localFile, { highWaterMark: putExtra.params.sliceSize || conf.BLOCK_SIZE });
  var rsStreamLen = fs.statSync(localFile).size;
  if (!putExtra.mimeType) {
    putExtra.mimeType = mime.lookup(localFile);
  }

  if (!putExtra.fname) {
    putExtra.fname = path.basename(localFile);
  }

  return this.putStream(uploadToken, key, rsStream, rsStreamLen, putExtra,
    callbackFunc);
}

ResumeUploader.prototype.putFileWithoutKey = function(uploadToken, localFile,
  putExtra, callbackFunc) {
  return this.putFile(uploadToken, null, localFile, putExtra, callbackFunc);
}
