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

Service.prototype.putAuthEx = function(onret, expires, callbackUrl) {
	/*
	 * func PutAuthEx(expires, callbackUrl) => PutAuthRet
	 * 上传授权（生成一个短期有效的可匿名上传URL）
	**/
	var url = config.IO_HOST + '/put-auth/' + expires + '/callback/' + util.encode(callbackUrl);
	this.conn.callWith(url, null, onret);
};

Service.prototype.put = function(onret, key, mimeType, fp, bytes) {
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

Service.prototype.putFile = function(onret, key, mimeType, localFile) {
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
		self.put(onret, key, mimeType, fp, fi.size);
	});
};

Service.prototype.get = function(onret, key, attName) {
	/*
	 * func Get(key string, attName string) => GetRet
	 * 下载授权（生成一个短期有效的可匿名下载URL）
	**/
	var entryURI = this.bucket + ':' + key;
	var url = config.RS_HOST + '/get/' + util.encode(entryURI) + '/attName/' + util.encode(attName);
	this.conn.callWith(url, null, onret);
};

Service.prototype.getIfNotModified = function(onret, key, attName, base) {
	/*
	 * func GetIfNotModified(key string, attName string, base string) => GetRet
	 * 下载授权（生成一个短期有效的可匿名下载URL），如果服务端文件没被人修改的话（用于断点续传）
	**/
	var entryURI = this.bucket + ':' + key;
	var url = config.RS_HOST + '/get/' + util.encode(entryURI) + '/attName/' + util.encode(attName) + '/base/' + base;
	this.conn.callWith(url, null, onret);
};

Service.prototype.stat = function(onret, key) {
	/*
	 * func Stat(key string) => Entry
	 * 取资源属性
	*/
	var entryURI = this.bucket + ':' + key;
	var url = config.RS_HOST + '/stat/' + util.encode(entryURI);
	this.conn.callWith(url, null, onret);
};

Service.prototype.publish = function(onret, domain) {
	/*
	 * func Publish(domain string) => Bool
	 * 将本 Table 的内容作为静态资源发布。静态资源的url为：http://domain/key
	**/
	var url = config.RS_HOST + '/publish/' + util.encode(domain) + '/from/' + this.bucket;
	this.conn.callWith(url, null, onret);
};

Service.prototype.unpublish = function(onret, domain) {
	/*
	 * func Unpublish(domain string) => Bool
	 * 取消发布
	*/
	var url = config.RS_HOST + '/unpublish/' + util.encode(domain);
	this.conn.callWith(url, null, onret);
};

Service.prototype.remove = function(onret, key) {
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

exports.Service = Service;

// ------------------------------------------------------------------------------------------

