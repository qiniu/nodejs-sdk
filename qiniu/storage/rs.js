const url = require('url');
const crypto = require('crypto');
const formstream = require('formstream');
const querystring = require('querystring');
const rpc = require('../rpc');
const conf = require('../conf');
const digest = require('../auth/digest');
const util = require('../util');
const zone = require('../zone');

exports.BucketManager = BucketManager;
exports.PutPolicy = PutPolicy;

function BucketManager(mac, config) {
  this.mac = mac || new digest.Mac();
  this.config = config || new conf.Config();
}

// 获取资源信息
// @link https://developer.qiniu.com/kodo/api/1308/stat
// @param bucket 空间名称
// @param key    文件名称
// @param callbackFunc(err, respBody, respInfo) 回调函数
BucketManager.prototype.stat = function(bucket, key, callbackFunc) {
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

  if (useCache) {
    statReq(this.mac, this.config, bucket, key, callbackFunc);
  } else {
    zone.getZoneInfo(this.mac.accessKey, bucket, function(err, cZoneInfo,
      cZoneExpire) {
      if (err) {
        callbackFunc(err, null, null);
        return;
      }

      //update object
      that.config.zone = cZoneInfo;
      that.config.zoneExpire = cZoneExpire;
      //req
      statReq(that.mac, that.config, bucket, key, callbackFunc);
    });
  }
}

function statReq(mac, config, bucket, key, callbackFunc) {
  var scheme = config.useHttpsDomain ? "https://" : "http://";
  var statOp = exports.statOp(bucket, key);
  var requestURI = scheme + config.zone.rsHost + statOp;
  var digest = util.generateAccessToken(mac, requestURI, null);
  rpc.postWithoutForm(requestURI, digest, callbackFunc);
}

//  修改文件的类型
// @link https://developer.qiniu.com/kodo/api/1252/chgm
// @param bucket  空间名称
// @param key     文件名称
// @param newMime 新文件类型
// @param callbackFunc(err, respBody, respInfo) 回调函数
BucketManager.prototype.changeMime = function(bucket, key, newMime,
  callbackFunc) {
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

  if (useCache) {
    changeMimeReq(this.mac, this.config, bucket, key, newMime, callbackFunc);
  } else {
    zone.getZoneInfo(this.mac.accessKey, bucket, function(err, cZoneInfo,
      cZoneExpire) {
      if (err) {
        callbackFunc(err, null, null);
        return;
      }

      //update object
      that.config.zone = cZoneInfo;
      that.config.zoneExpire = cZoneExpire;
      //req
      changeMimeReq(that.mac, that.config, bucket, key, newMime,
        callbackFunc);
    });
  }
}

function changeMimeReq(mac, config, bucket, key, newMime, callbackFunc) {
  var scheme = config.useHttpsDomain ? "https://" : "http://";
  var changeMimeOp = exports.changeMimeOp(bucket, key, newMime);
  var requestURI = scheme + config.zone.rsHost + changeMimeOp;
  var digest = util.generateAccessToken(mac, requestURI, null);
  rpc.postWithoutForm(requestURI, digest, callbackFunc);
}

// 移动或重命名文件，当bucketSrc==bucketDest相同的时候，就是重命名文件操作
// @link https://developer.qiniu.com/kodo/api/1257/delete
// @param srcBucket  源空间名称
// @param srcKey     源文件名称
// @param destBucket 目标空间名称
// @param destKey    目标文件名称
// @param options    可选参数
//                   force 强制覆盖
// @param callbackFunc(err, respBody, respInfo) 回调函数
BucketManager.prototype.move = function(srcBucket, srcKey, destBucket, destKey,
  options, callbackFunc) {
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

  if (useCache) {
    moveReq(this.mac, this.config, srcBucket, srcKey, destBucket, destKey,
      options, callbackFunc);
  } else {
    zone.getZoneInfo(this.mac.accessKey, srcBucket, function(err, cZoneInfo,
      cZoneExpire) {
      if (err) {
        callbackFunc(err, null, null);
        return;
      }

      //update object
      that.config.zone = cZoneInfo;
      that.config.zoneExpire = cZoneExpire;
      //req
      moveReq(that.mac, that.config, srcBucket, srcKey, destBucket,
        destKey, options, callbackFunc);
    });
  }
}

function moveReq(mac, config, srcBucket, srcKey, destBucket, destKey,
  options, callbackFunc) {
  var scheme = config.useHttpsDomain ? "https://" : "http://";
  var moveOp = exports.moveOp(srcBucket, srcKey, destBucket, destKey, options);
  var requestURI = scheme + config.zone.rsHost + moveOp;
  var digest = util.generateAccessToken(mac, requestURI, null);
  rpc.postWithoutForm(requestURI, digest, callbackFunc);
}

// 复制一个文件
// @link https://developer.qiniu.com/kodo/api/1254/copy
// @param srcBucket  源空间名称
// @param srcKey     源文件名称
// @param destBucket 目标空间名称
// @param destKey    目标文件名称
// @param options    可选参数
//                   force 强制覆盖
// @param callbackFunc(err, respBody, respInfo) 回调函数
BucketManager.prototype.copy = function(srcBucket, srcKey, destBucket, destKey,
  options, callbackFunc) {
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

  if (useCache) {
    copyReq(this.mac, this.config, srcBucket, srcKey, destBucket, destKey,
      options, callbackFunc);
  } else {
    zone.getZoneInfo(this.mac.accessKey, srcBucket, function(err, cZoneInfo,
      cZoneExpire) {
      if (err) {
        callbackFunc(err, null, null);
        return;
      }

      //update object
      that.config.zone = cZoneInfo;
      that.config.zoneExpire = cZoneExpire;
      //req
      copyReq(that.mac, that.config, srcBucket, srcKey, destBucket,
        destKey, options, callbackFunc);
    });
  }
}

function copyReq(mac, config, srcBucket, srcKey, destBucket, destKey,
  options, callbackFunc) {
  options = options || {};
  var scheme = config.useHttpsDomain ? "https://" : "http://";
  var copyOp = exports.copyOp(srcBucket, srcKey, destBucket, destKey, options);
  var requestURI = scheme + config.zone.rsHost + copyOp;
  var digest = util.generateAccessToken(mac, requestURI, null);
  rpc.postWithoutForm(requestURI, digest, callbackFunc);
}

// 删除资源
// @link https://developer.qiniu.com/kodo/api/1257/delete
// @param bucket 空间名称
// @param key    文件名称
// @param callbackFunc(err, respBody, respInfo) 回调函数
BucketManager.prototype.delete = function(bucket, key, callbackFunc) {
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

  if (useCache) {
    deleteReq(this.mac, this.config, bucket, key, callbackFunc);
  } else {
    zone.getZoneInfo(this.mac.accessKey, bucket, function(err, cZoneInfo,
      cZoneExpire) {
      if (err) {
        callbackFunc(err, null, null);
        return;
      }

      //update object
      that.config.zone = cZoneInfo;
      that.config.zoneExpire = cZoneExpire;
      //req
      deleteReq(that.mac, that.config, bucket, key, callbackFunc);
    });
  }
}

function deleteReq(mac, config, bucket, key, callbackFunc) {
  var scheme = config.useHttpsDomain ? "https://" : "http://";
  var deleteOp = exports.deleteOp(bucket, key);
  var requestURI = scheme + config.zone.rsHost + deleteOp;
  var digest = util.generateAccessToken(mac, requestURI, null);
  rpc.postWithoutForm(requestURI, digest, callbackFunc);
}


// 更新文件的生命周期
// @link https://developer.qiniu.com/kodo/api/1732/update-file-lifecycle
// @param bucket 空间名称
// @param key    文件名称
// @param days   有效期天数
// @param callbackFunc(err, respBody, respInfo) 回调函数
BucketManager.prototype.deleteAfterDays = function(bucket, key, days,
  callbackFunc) {
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

  if (useCache) {
    deleteAfterDaysReq(this.mac, this.config, bucket, key, days, callbackFunc);
  } else {
    zone.getZoneInfo(this.mac.accessKey, bucket, function(err, cZoneInfo,
      cZoneExpire) {
      if (err) {
        callbackFunc(err, null, null);
        return;
      }

      //update object
      that.config.zone = cZoneInfo;
      that.config.zoneExpire = cZoneExpire;
      //req
      deleteAfterDaysReq(that.mac, that.config, bucket, key, days,
        callbackFunc);
    });
  }
}

function deleteAfterDaysReq(mac, config, bucket, key, days, callbackFunc) {
  var scheme = config.useHttpsDomain ? "https://" : "http://";
  var deleteAfterDaysOp = exports.deleteAfterDaysOp(bucket, key, days);
  var requestURI = scheme + config.zone.rsHost + deleteAfterDaysOp;
  var digest = util.generateAccessToken(mac, requestURI, null);
  rpc.postWithoutForm(requestURI, digest, callbackFunc);
}

// 抓取资源
// @link https://developer.qiniu.com/kodo/api/1263/fetch
// @param resUrl 资源链接
// @param bucket 空间名称
// @param key    文件名称
// @param callbackFunc(err, respBody, respInfo) 回调函数
BucketManager.prototype.fetch = function(resUrl, bucket, key, callbackFunc) {
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

  if (useCache) {
    fetchReq(this.mac, this.config, resUrl, bucket, key, callbackFunc);
  } else {
    zone.getZoneInfo(this.mac.accessKey, bucket, function(err, cZoneInfo,
      cZoneExpire) {
      if (err) {
        callbackFunc(err, null, null);
        return;
      }

      //update object
      that.config.zone = cZoneInfo;
      that.config.zoneExpire = cZoneExpire;
      //req
      fetchReq(that.mac, that.config, resUrl, bucket, key, callbackFunc);
    });
  }
}

function fetchReq(mac, config, resUrl, bucket, key, callbackFunc) {
  var scheme = config.useHttpsDomain ? "https://" : "http://";
  var encodedEntryURI = util.encodedEntry(bucket, key);
  var encodedResURL = util.urlsafeBase64Encode(resUrl);
  var requestURI = scheme + config.zone.ioHost + '/fetch/' + encodedResURL +
    '/to/' + encodedEntryURI;
  var digest = util.generateAccessToken(mac, requestURI, null);
  rpc.postWithoutForm(requestURI, digest, callbackFunc);
}

// 更新镜像副本
// @link https://developer.qiniu.com/kodo/api/1293/prefetch
// @param bucket 空间名称
// @param key    文件名称
// @param callbackFunc(err, respBody, respInfo) 回调函数
BucketManager.prototype.prefetch = function(bucket, key, callbackFunc) {
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

  if (useCache) {
    prefetchReq(this.mac, this.config, bucket, key, callbackFunc);
  } else {
    zone.getZoneInfo(this.mac.accessKey, bucket, function(err, cZoneInfo,
      cZoneExpire) {
      if (err) {
        callbackFunc(err, null, null);
        return;
      }

      //update object
      that.config.zone = cZoneInfo;
      that.config.zoneExpire = cZoneExpire;
      //req
      prefetchReq(that.mac, that.config, bucket, key, callbackFunc);
    });
  }
}

function prefetchReq(mac, config, bucket, key, callbackFunc) {
  var scheme = config.useHttpsDomain ? "https://" : "http://";
  var encodedEntryURI = util.encodedEntry(bucket, key);
  var requestURI = scheme + config.zone.ioHost + '/prefetch/' + encodedEntryURI;
  var digest = util.generateAccessToken(mac, requestURI, null);
  rpc.postWithoutForm(requestURI, digest, callbackFunc);
}

// 修改文件的存储类型
// @link https://developer.qiniu.com/kodo/api/3710/modify-the-file-type
// @param bucket  空间名称
// @param key     文件名称
// @param newType 新文件存储类型
// @param callbackFunc(err, respBody, respInfo) 回调函数
BucketManager.prototype.changeType = function(bucket, key, newType,
  callbackFunc) {
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

  if (useCache) {
    changeTypeReq(this.mac, this.config, bucket, key, newType, callbackFunc);
  } else {
    zone.getZoneInfo(this.mac.accessKey, bucket, function(err, cZoneInfo,
      cZoneExpire) {
      if (err) {
        callbackFunc(err, null, null);
        return;
      }

      //update object
      that.config.zone = cZoneInfo;
      that.config.zoneExpire = cZoneExpire;
      //req
      changeTypeReq(that.mac, that.config, bucket, key, newType,
        callbackFunc);
    });
  }
}

function changeTypeReq(mac, config, bucket, key, newType, callbackFunc) {
  var scheme = config.useHttpsDomain ? "https://" : "http://";
  var changeTypeOp = exports.changeTypeOp(bucket, key, newType);
  var requestURI = scheme + config.zone.rsHost + changeTypeOp;
  var digest = util.generateAccessToken(mac, requestURI, null);
  rpc.postWithoutForm(requestURI, digest, callbackFunc);
}


// 设置空间镜像源
// @link https://developer.qiniu.com/kodo/api/1370/mirror
// @param bucket 空间名称
// @param srcSiteUrl 镜像源地址
// @param srcHost 镜像Host
// @param callbackFunc(err, respBody, respInfo) 回调函数
const PU_HOST = "http://pu.qbox.me:10200";
BucketManager.prototype.image = function(bucket, srcSiteUrl, srcHost,
  callbackFunc) {
  var encodedSrcSite = util.urlsafeBase64Encode(srcSiteUrl);
  var requestURI = PU_HOST + "/image/" + bucket + "/from/" + encodedSrcSite;
  if (srcHost) {
    var encodedHost = util.urlsafeBase64Encode(srcHost);
    requestURI += "/host/" + encodedHost;
  }
  var digest = util.generateAccessToken(this.mac, requestURI, null);
  rpc.postWithoutForm(requestURI, digest, callbackFunc);
}

// 取消设置空间镜像源
// @link https://developer.qiniu.com/kodo/api/1370/mirror
// @param bucket 空间名称
// @param callbackFunc(err, respBody, respInfo) 回调函数
BucketManager.prototype.unimage = function(bucket, callbackFunc) {
  var requestURI = PU_HOST + "/unimage/" + bucket;
  var digest = util.generateAccessToken(this.mac, requestURI, null);
  rpc.postWithoutForm(requestURI, digest, callbackFunc);
}

// 获取指定前缀的文件列表
// @link https://developer.qiniu.com/kodo/api/1284/list
//
// @param bucket 空间名称
// @param options 列举操作的可选参数
//                prefix    列举的文件前缀
//                marker    上一次列举返回的位置标记，作为本次列举的起点信息
//                limit     每次返回的最大列举文件数量
//                delimiter 指定目录分隔符
// @param callbackFunc(err, respBody, respInfo) - 回调函数
BucketManager.prototype.listPrefix = function(bucket, options, callbackFunc) {
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

  if (useCache) {
    listPrefixReq(this.mac, this.config, bucket, options, callbackFunc);
  } else {
    zone.getZoneInfo(this.mac.accessKey, bucket, function(err, cZoneInfo,
      cZoneExpire) {
      if (err) {
        callbackFunc(err, null, null);
        return;
      }

      //update object
      that.config.zone = cZoneInfo;
      that.config.zoneExpire = cZoneExpire;
      //req
      listPrefixReq(that.mac, that.config, bucket, options, callbackFunc);
    });
  }
}

function listPrefixReq(mac, config, bucket, options, callbackFunc) {
  options = options || {};
  //必须参数
  var reqParams = {
    bucket: bucket,
  };

  if (options.prefix) {
    reqParams.prefix = options.prefix;
  } else {
    reqParams.prefix = "";
  }

  if (options.limit >= 1 && options.limit <= 1000) {
    reqParams.limit = options.limit;
  } else {
    reqParams.limit = 1000;
  }

  if (options.marker) {
    reqParams.marker = options.marker;
  } else {
    reqParams.marker = "";
  }

  if (options.delimiter) {
    reqParams.delimiter = options.delimiter;
  } else {
    reqParams.delimiter = "";
  }

  var scheme = config.useHttpsDomain ? "https://" : "http://";
  var reqSpec = querystring.stringify(reqParams);
  var requestURI = scheme + config.zone.rsfHost + '/list?' + reqSpec;

  var auth = util.generateAccessToken(mac, requestURI, null);
  rpc.postWithForm(requestURI, null, auth, callbackFunc);
}

// 批量文件管理请求，支持stat，chgm，chtype，delete，copy，move
BucketManager.prototype.batch = function(operations, callbackFunc) {
  var requestURI = conf.RS_HOST + "/batch";
  var reqParams = {
    op: operations,
  };
  var reqBody = querystring.stringify(reqParams);
  var digest = util.generateAccessToken(this.mac, requestURI, reqBody);
  rpc.postWithForm(requestURI, reqBody, digest, callbackFunc);
}

// 批量操作支持的指令构造器
exports.statOp = function(bucket, key) {
  return "/stat/" + util.encodedEntry(bucket, key);
}

exports.deleteOp = function(bucket, key) {
  return "/delete/" + util.encodedEntry(bucket, key);
}

exports.deleteAfterDaysOp = function(bucket, key, days) {
  var encodedEntryURI = util.encodedEntry(bucket, key);
  return '/deleteAfterDays/' + encodedEntryURI + "/" + days;
}

exports.changeMimeOp = function(bucket, key, newMime) {
  var encodedEntryURI = util.encodedEntry(bucket, key);
  var encodedMime = util.urlsafeBase64Encode(newMime);
  return '/chgm/' + encodedEntryURI + '/mime/' + encodedMime;
}

exports.changeTypeOp = function(bucket, key, newType) {
  var encodedEntryURI = util.encodedEntry(bucket, key);
  return '/chtype/' + encodedEntryURI + '/type/' + newType;
}

exports.moveOp = function(srcBucket, srcKey, destBucket, destKey, options) {
  options = options || {};
  var encodedEntryURISrc = util.encodedEntry(srcBucket, srcKey);
  var encodedEntryURIDest = util.encodedEntry(destBucket, destKey);
  var op = "/move/" + encodedEntryURISrc + "/" + encodedEntryURIDest;
  if (options.force) {
    op += "/force/true";
  }
  return op;
}

exports.copyOp = function(srcBucket, srcKey, destBucket, destKey, options) {
  options = options || {};
  var encodedEntryURISrc = util.encodedEntry(srcBucket, srcKey);
  var encodedEntryURIDest = util.encodedEntry(destBucket, destKey);
  var op = "/copy/" + encodedEntryURISrc + "/" + encodedEntryURIDest;
  if (options.force) {
    op += "/force/true";
  }
  return op;
}

// 空间资源下载

// 获取私有空间的下载链接
// @param domain 空间绑定的域名，比如以http或https开头
// @param fileName 原始文件名
// @param deadline 文件有效期时间戳（单位秒）
// @return 私有下载链接
BucketManager.prototype.privateDownloadUrl = function(domain, fileName,
  deadline) {
  var baseUrl = this.publicDownloadUrl(domain, fileName);
  if (baseUrl.indexOf('?') >= 0) {
    baseUrl += '&e=';
  } else {
    baseUrl += '?e=';
  }
  baseUrl += deadline;

  var signature = util.hmacSha1(baseUrl, this.mac.secretKey);
  var encodedSign = util.base64ToUrlSafe(signature);
  var downloadToken = this.mac.accessKey + ':' + encodedSign;
  return baseUrl + '&token=' + downloadToken;
}

// 获取公开空间的下载链接
// @param domain 空间绑定的域名，比如以http或https开头
// @param fileName 原始文件名
// @return 公开下载链接
BucketManager.prototype.publicDownloadUrl = function(domain, fileName) {
  return domain + "/" + encodeURI(fileName);

}

// 上传策略
// @link https://developer.qiniu.com/kodo/manual/1206/put-policy
function PutPolicy(options) {
  if (typeof options !== 'object') {
    throw new Error('invalid putpolicy options');
  }

  this.scope = options.scope || null;
  this.isPrefixalScope = options.isPrefixalScope || null;
  this.expires = options.expires || 3600;
  this.insertOnly = options.insertOnly || null;

  this.saveKey = options.saveKey || null;
  this.endUser = options.endUser || null;

  this.returnUrl = options.returnUrl || null;
  this.returnBody = options.returnBody || null;

  this.callbackUrl = options.callbackUrl || null;
  this.callbackHost = options.callbackHost || null;
  this.callbackBody = options.callbackBody || null;
  this.callbackBodyType = options.callbackBodyType || null;
  this.callbackFetchKey = options.callbackFetchKey || null;

  this.persistentOps = options.persistentOps || null;
  this.persistentNotifyUrl = options.persistentNotifyUrl || null;
  this.persistentPipeline = options.persistentPipeline || null;

  this.fsizeLimit = options.fsizeLimit || null;
  this.fsizeMin = options.fsizeMin || null;
  this.mimeLimit = options.mimeLimit || null;

  this.detectMime = options.detectMime || null;
  this.deleteAfterDays = options.deleteAfterDays || null;
  this.fileType = options.fileType || null;
}

PutPolicy.prototype.getFlags = function() {
  var flags = {};
  var attrs = ['scope', 'isPrefixalScope', 'insertOnly', 'saveKey', 'endUser',
    'returnUrl', 'returnBody', 'callbackUrl', 'callbackHost',
    'callbackBody', 'callbackBodyType', 'callbackFetchKey', 'persistentOps',
    'persistentNotifyUrl', 'persistentPipeline', 'fsizeLimit', 'fsizeMin',
    'detectMime', 'mimeLimit', 'deleteAfterDays', 'fileType'
  ];

  for (var i = attrs.length - 1; i >= 0; i--) {
    if (this[attrs[i]] !== null) {
      flags[attrs[i]] = this[attrs[i]];
    }
  }

  flags['deadline'] = this.expires + Math.floor(Date.now() / 1000);

  return flags;
}


PutPolicy.prototype.uploadToken = function(mac) {
  mac = mac || new digest.Mac();
  var flags = this.getFlags();
  var encodedFlags = util.urlsafeBase64Encode(JSON.stringify(flags));
  var encoded = util.hmacSha1(encodedFlags, mac.secretKey);
  var encodedSign = util.base64ToUrlSafe(encoded);
  var uploadToken = mac.accessKey + ':' + encodedSign + ':' + encodedFlags;
  return uploadToken;
}
