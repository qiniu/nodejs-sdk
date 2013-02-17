var fs = require('fs');
var path = require('path');
var crc32 = require('crc32');
var mime = require('mime');
var formstream = require('formstream');
var querystring = require('querystring');
var config = require('./conf.js');
var util = require('./util.js');
var img = require('./img.js');

exports.Service = Service;
exports.mkbucket = function(conn, bucketname, onret) {
    var url = config.RS_HOST + '/mkbucket/' + bucketname;
    conn.callWith(url, null, onret);
};

// ------------------------------------------------------------------------------------------
// type Service

function Service(conn, bucket) {
    this.conn = conn;
    this.bucket = bucket;
}

Service.prototype.buckets = function(onret) {
    var url = config.RS_HOST + '/buckets';
    this.conn.callWith(url, null, onret);
};

Service.prototype.putAuth = function(onret) {
    /*
     * func PutAuth() => PutAuthRet
     * 上传授权（生成一个短期有效的可匿名上传URL）
    **/
    var url = config.IO_HOST + '/put-auth/';
    this.conn.callWith(url, null, onret);
};

Service.prototype.putAuthEx = function(expires, callbackUrl, onret) {
    /*
     * func PutAuthEx(expires, callbackUrl) => PutAuthRet
     * 上传授权（生成一个短期有效的可匿名上传URL）
    **/
    var url = config.IO_HOST + '/put-auth/' + expires + '/callback/' + util.encode(callbackUrl);
    this.conn.callWith(url, null, onret);
};

Service.prototype.put = function(key, mimeType, fp, bytes, onret) {
    /*
     * func Put(key string, mimeType string, fp File, bytes int64) => (data PutRet, code int, err Error)
     * 上传一个流
    **/
    if (!mimeType) {
        mimeType = 'application/octet-stream';
    }
    var entryURI = this.bucket + ':' + key;
    var url = config.IO_HOST + '/rs-put/' + util.encode(entryURI) + '/mimeType/' + util.encode(mimeType);
    var binary = new util.Binary(fp, bytes);
    return this.conn.callWith(url, binary, onret);
};

Service.prototype.putFile = function(key, mimeType, localFile, onret) {
    /*
     * func PutFile(key string, mimeType string, localFile string) => (data PutRet, code int, err Error)
     * 上传文件
    **/
    var self = this;
    if (!mimeType) {
        mimeType = mime.lookup(localFile);
    }
    fs.stat(localFile, function(err, fi) {
        if (err) {
            onret({code: -1, error: err.toString(), detail: err});
            return;
        }
        var fp = fs.createReadStream(localFile);
        self.put(key, mimeType, fp, fi.size, onret);
    });
};

Service.prototype.upload = function(upToken, key, mimeType, filename, stream, onret) {
    /*
     * func Upload(upToken string, key string, mimeType string, filename string, stream ReadStream) => (data PutRet, code int, err Error)
     * 以multipart/form-data形式上传ReadStream
    **/
    var self = this;
    if (!mimeType) {
        mimeType = "application/octet-stream";
    }
    var entryURI = this.bucket + ':' + key;
    entryURI = '/rs-put/' + util.encode(entryURI) + '/mimeType/' + util.encode(mimeType);

    var form = formstream();
    form.field('action', entryURI);
    form.stream('file', stream, filename, mimeType);

    form = new util.Form(form, form.headers()['Content-Type']);
    return this.conn.callWith(upToken, form, onret);
};

Service.prototype.uploadFile = function(upToken, key, mimeType, localFile, onret) {
    /*
     * func UploadFile(upToken string, key string, mimeType string, localFile string) => (data PutRet, code int, err Error)
     * 以multipart/form-data形式上传文件
    **/
    var self = this;
    if (!mimeType) {
        mimeType = mime.lookup(localFile);
    }
    fs.stat(localFile, function(err, fi) {
        if (err) {
            onret({code: -1, error: err.toString(), detail: err});
            return;
        }
        var filename = path.basename(localFile);
        var stream = fs.createReadStream(localFile);
        self.upload(upToken, key, mimeType, filename, stream, onret);
    });
};

Service.prototype.uploadWithToken = function(uploadToken, stream, key, mimeType, customMeta, callbackParams, crc32, onret) {
  /*
   * func UploadWithToken(uploadToken, stream, key, mimeType, customMeta, callbackParams, crc32, onret) => (data PutRet, code int, err Error)
   * 使用upload_token以multipart/form-data形式上传ReadStream流
  **/
  var bucket = this.bucket;
  if (!mimeType) {
    mimeType = "application/octet-stream";
  }

  var actionString = util.generateActionString(bucket, key, mimeType, customMeta, crc32);
  if (callbackParams === null) {
    callbackParams = {
      "bucket": bucket,
      "key": key,
      "mime_type": mimeType
    };
  }
  var callbackQueryString = querystring.stringify(callbackParams);
  var url = config.UP_HOST + "/upload";

  var filename = path.basename(key);
  var form = formstream();
  form.field('action', actionString);
  form.field('params', callbackQueryString);
  form.field('multipart', true);
  form.field('auth', uploadToken);
  form.stream('file', stream, filename, mimeType);
  form = new util.Form(form, form.headers()['Content-Type']);

  return this.conn.callWithToken(uploadToken, url, form, onret);
};

Service.prototype.uploadFileWithToken = function(uploadToken, localFile, key, mimeType, customMeta, callbackParams, enableCrc32Check, onret) {
  /*
   * func UploadFileWithToken(uploadToken, localFile, key, mimeType, customMeta, callbackParams, enableCrc32Check, onret) => (data PutRet, code int, err Error)
   * 使用upload_token以multipart/form-data形式上传文件
  **/
  var self = this
    , bucket = self.bucket;
  if (!mimeType) {
    mimeType = mime.lookup(localFile);
  }
  fs.stat(localFile, function(err, fi) {
    if (err) {
      onret({code: -1, error: err.toString(), detail: err});
      return;
    }
    var fileCrc32 = null
      , stream = fs.createReadStream(localFile);

    if (enableCrc32Check) {
      var fileStat = fs.statSync(localFile)
        , fileSize = fileStat.size
        , buf = new Buffer(fileSize)
        , fd = fs.openSync(localFile, 'r');
      
      fs.readSync(fd, buf, 0, fileSize, 0);
      fs.closeSync(fd);
      fileCrc32 = parseInt("0x" + crc32(buf)).toString();
    }

    self.uploadWithToken(uploadToken, stream, key, mimeType, customMeta, callbackParams, fileCrc32, onret);
  });
};

Service.prototype.get = function(key, attName, onret) {
    /*
     * func Get(key string, attName string) => GetRet
     * 下载授权（生成一个短期有效的可匿名下载URL）
    **/
    var entryURI = this.bucket + ':' + key;
    var url = config.RS_HOST + '/get/' + util.encode(entryURI) + '/attName/' + util.encode(attName);
    this.conn.callWith(url, null, onret);
};

Service.prototype.getIfNotModified = function(key, attName, base, onret) {
    /*
     * func GetIfNotModified(key string, attName string, base string) => GetRet
     * 下载授权（生成一个短期有效的可匿名下载URL），如果服务端文件没被人修改的话（用于断点续传）
    **/
    var entryURI = this.bucket + ':' + key;
    var url = config.RS_HOST + '/get/' + util.encode(entryURI) + '/attName/' + util.encode(attName) + '/base/' + base;
    this.conn.callWith(url, null, onret);
};

Service.prototype.stat = function(key, onret) {
    /*
     * func Stat(key string) => Entry
     * 取资源属性
    */
    var entryURI = this.bucket + ':' + key;
    var url = config.RS_HOST + '/stat/' + util.encode(entryURI);
    this.conn.callWith(url, null, onret);
};

Service.prototype.publish = function(domain, onret) {
    /*
     * func Publish(domain string) => Bool
     * 将本 Table 的内容作为静态资源发布。静态资源的url为：http://domain/key
    **/
    var url = config.RS_HOST + '/publish/' + util.encode(domain) + '/from/' + this.bucket;
    this.conn.callWith(url, null, onret);
};

Service.prototype.unpublish = function(domain, onret) {
    /*
     * func Unpublish(domain string) => Bool
     * 取消发布
    */
    var url = config.RS_HOST + '/unpublish/' + util.encode(domain);
    this.conn.callWith(url, null, onret);
};

Service.prototype.remove = function(key, onret) {
    /*
     * func Delete(key string) => Bool
     * 删除资源
    **/
    var entryURI = this.bucket + ':' + key;
    var url = config.RS_HOST + '/delete/' + util.encode(entryURI);
    this.conn.callWith(url, null, onret);
};

Service.prototype.drop = function(onret) {
    /*
     * func Drop() => Bool
     * 删除整个表（慎用！）
    **/
    var url = config.RS_HOST + '/drop/' + this.bucket;
    this.conn.callWith(url, null, onret);
};

Service.prototype.copy = function(sourceBucket, sourceKey, targetBucket, targetKey, onret) {
  /*
   * func Copy(sourceBucket, sourceKey, targetBucket, targetKey, onret) => Bool
   * 拷贝某个资源表中的文件到另一个资源表中的某个文件
   */
  var url = config.RS_HOST + generateMoveOrCopyOpString('copy', sourceBucket, sourceKey, targetBucket, targetKey);
  this.conn.callWith(url, null, onret);
};

Service.prototype.move = function(sourceBucket, sourceKey, targetBucket, targetKey, onret) {
  /*
   * func Move(sourceBucket, sourceKey, targetBucket, targetKey, onret) => Bool
   * 移动某个资源表中的文件到另一个资源表中的某个文件
   */
  var url = config.RS_HOST + generateMoveOrCopyOpString('move', sourceBucket, sourceKey, targetBucket, targetKey);
  this.conn.callWith(url, null, onret);
};

Service.prototype.batchGet = function(bucket, keys, onret) {
  /*
   * func BatchGet(bucket, keys, onret) => GetRet[]
   * 为每个key生成一个短期有效的下载地址
   */
  batch(this, "get", bucket, keys, onret);
};

Service.prototype.batchStat = function(bucket, keys, onret) {
  /*
   * func BatchStat(bucket, keys, onret) => Entry[]
   * 查看每个key所对应文件的属性
   */
  batch(this, "stat", bucket, keys, onret);
};

Service.prototype.batchDelete = function(bucket, keys, onret) {
  /*
   * func BatchDelete(bucket, keys, onret) => Bool[]
   * 批量删除每个key所对应的资源
   */
  batch(this, "delete", bucket, keys, onret);
};

Service.prototype.batchCopy = function(entries, onret) {
  /*
   * func BatchCopy(entries, onret) => Bool[]
   * 批量拷贝文件
   */
  batchMoveOrCopy(this, 'copy', entries, onret);
};

Service.prototype.batchMove = function(entries, onret) {
  /*
   * func BatchMove(entries, onret) => Bool[]
   * 批量移动文件
   */
  batchMoveOrCopy(this, 'move', entries, onret);
};

/*
 * 持久化存储一个经过云端服务处理过后的资源
 */
Service.prototype.saveAs = function(key, source_url, opWithParams, onret) {
    var destEntryURI = this.bucket + ':' + key;
    var saveAsEntryURI = util.encode(destEntryURI);
    var saveAsParam = "/save-as/" + saveAsEntryURI;
    var newurl = source_url + '?' + opWithParams + saveAsParam;
    this.conn.callWith(newurl, null, onret);
};

/*
 * 图像处理接口（可持久化存储缩略图）
 * func imageMogrifyAs(<DestKey>, <SourceImageDownloadURL>, <opts>, <callbackFunc>) => Entry
 * opts = {
 *   "thumbnail": <ImageSizeGeometry>,
 *   "gravity": <GravityType>, =NorthWest, North, NorthEast, West, Center, East, SouthWest, South, SouthEast
 *   "crop": <ImageSizeAndOffsetGeometry>,
 *   "quality": <ImageQuality>,
 *   "rotate": <RotateDegree>,
 *   "format": <DestinationImageFormat>, =jpg, gif, png, tif, etc.
 *   "auto_orient": <TrueOrFalse>
 * }
 */
Service.prototype.imageMogrifyAs = function(key, source_img_url, opts, onret) {
    var mogrifyParams = img.mkMogrifyParams(opts);
    this.saveAs(key, source_img_url, mogrifyParams, onret);
};

/*
 * 水印设置接口
 * setProtected() - 设置原图保护
 * setSeparator() - 设置分隔符
 * setStyle() - 设置图片预览风格别名
 * unsetStyle()    - 取消设置图片预览风格别名
*/
Service.prototype.setProtected = function(protectedMode, onret){
    var url = config.PUB_HOST + "/accessMode/" + this.bucket + "/mode/" + protectedMode;
    this.conn.callWith(url, null, onret);
};

Service.prototype.setSeparator = function(sep, onret){
    sep = util.encode(sep);
    var url = config.PUB_HOST + "/separator/" + this.bucket + "/sep/" + sep;
    this.conn.callWith(url, null, onret);
};

Service.prototype.setStyle = function(name, style, onret){
    name = util.encode(name);
    style = util.encode(style);
    var url = config.PUB_HOST + "/style/" + this.bucket + "/name/" + name + "/style/" + style;
    this.conn.callWith(url, null, onret);
};

Service.prototype.unsetStyle = function(name, onret){
    name = util.encode(name);
    var url = config.PUB_HOST + "/unstyle/" + this.bucket + "/name/" + name;
    this.conn.callWith(url, null, onret);
};


// ------------------------------------------------------------------------------------------
// private functions

function generateMoveOrCopyOpString(command, sourceBucket, sourceKey, targetBucket, targetKey) {
  var sourceEntryURI = sourceBucket + ":" + sourceKey;
  var targetEntryURI = targetBucket + ":" + targetKey;
  var url = '/' + command + '/' + util.encode(sourceEntryURI) + '/' + util.encode(targetEntryURI);
  return url;
};

function batch(rs, command, bucket, keys, onret) {
  var ops = []
    , length = keys.length
    , url = config.RS_HOST + '/batch?';

  for(var i = 0; i < length; i++) {
    console.log("Entry URI is: ", bucket + ":" + keys[i]);
    var encodedEntryURI = util.encode(bucket + ":" + keys[i]);
    ops.push("op=/" + command + "/" + encodedEntryURI);
  }
  url += ops.join("&");
  console.log("Batch URL: ", url);
  rs.conn.callWith(url, null, onret);
}

function batchMoveOrCopy(rs, command, entries, onret) {
  var ops = []
    , length = ops.length
    , url = config.RS_HOST + '/batch?';

  for(var i = 0; i < length; i++) {
    ops.push('op=' + moveOrCopy(command, entries[i][0], entries[i][1], entries[i][2], entries[i][3]));
  }
  url += ops.join("&");
  rs.conn.callWith(url, null, onret);
}

// ------------------------------------------------------------------------------------------
