var fs = require('fs');
var config = require('./conf.js');
var util = require('./util.js');

// ------------------------------------------------------------------------------------------
// type Service

function Service(conn, bucket) {
	this.conn = conn;
	this.bucket = bucket;
}

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
	if (!mimeType || mimeType === '') {
		mimeType = 'application/octet-stream';
	}
	var entryURI = this.bucket + ':' + key;
	var url = config.IO_HOST + '/rs-put/' + util.encode(entryURI) + '/mimeType/' + util.encode(mimeType);
	var binary = new util.Binary(fp, bytes);
	this.conn.callWith(url, binary, onret);
};

Service.prototype.putFile = function(key, mimeType, localFile, onret) {
	/*
	 * func PutFile(key string, mimeType string, localFile string) => (data PutRet, code int, err Error)
	 * 上传文件
	**/
	var self = this;
	fs.stat(localFile, function(err, fi) {
		if (err) {
			onret({code: -1, error: err.toString(), detail: err});
			return;
		}
		var fp = fs.createReadStream(localFile);
		self.put(key, mimeType, fp, fi.size, onret);
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


/*
 * 图像处理接口，生成最终的缩略图预览URL
 * func thumbnail() => string
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
Service.prototype.thumbnail = function(url, opts) {
    opts = opts || {};
    var params_string = "", key = null, val = null;
    var keys = ["thumbnail", "gravity", "crop", "quality", "rotate", "format"];
    for (var i=0; i < keys.length; i++) {
        key = keys[i];
        if (undefined !== opts[key]) {
            params_string += '/' + key + '/' + opts[key];
        }
    }
    if(undefined !== opts.auto_orient && opts.auto_orient === true){params_string += "/auto-orient";}
    var query_params = 'imageMogr' + params_string;
	return url + '?' + query_params;
};


/*
 * 图像处理接口（可持久化存储缩略图）
 * func thumbnailSaveAs(<ImageDownloadURL>, <opts>, <callbackFunc>) => Entry
 * opts = {
 *   "thumbnail": <ImageSizeGeometry>,
 *   "gravity": <GravityType>, =NorthWest, North, NorthEast, West, Center, East, SouthWest, South, SouthEast
 *   "crop": <ImageSizeAndOffsetGeometry>,
 *   "quality": <ImageQuality>,
 *   "rotate": <RotateDegree>,
 *   "format": <DestinationImageFormat>, =jpg, gif, png, tif, etc.
 *   "auto_orient": <TrueOrFalse>,
 *   "save_as": {
 *       "bucket": <Bucket>,
 *       "key": <Key>
 *   }
 * }
 */
Service.prototype.thumbnailSaveAs = function(url, opts, onret) {
    var newurl = this.thumbnail(url, opts);
    if(undefined !== opts.save_as && opts.save_as != ""){
        var destKey = "", destBucket = this.bucket;
        var saveAs = opts.save_as;
        if (typeof saveAs === 'string') {
            destBucket = destBucket;
            destKey = saveAs;
        } else if(typeof saveAs === 'object') {
            destBucket = saveAs.bucket || destBucket;
            destKey = saveAs.key;
        }
        var destEntryURI = destBucket + ':' + destKey;
        var saveAsEntryURI = util.encode(destEntryURI);
        newurl += "/save-as/" + saveAsEntryURI;
    }
	this.conn.callWith(newurl, null, onret);
};

exports.Service = Service;

// ------------------------------------------------------------------------------------------

