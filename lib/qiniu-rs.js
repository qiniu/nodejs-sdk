var fs = require('fs');
var util = require('./qiniu-util.js');
var cli = require("./qiniu-client.js");

function QiniuRS(options){
    options = options || {};
    var rs = this;
    var baseOptions = {
        "io_host": "http://iovip.qbox.me",
        "rs_host": "http://rs.qbox.me:10100",
        "access_key": "",
        "secret_key": "",
        "app_bucket": ""
    };

    var init = function(){
        setOptions(options);

        rs.IO_HOST = baseOptions["io_host"];
        rs.RS_HOST = baseOptions["rs_host"];
        rs.BUCKET = baseOptions["app_bucket"];

        rs.conn = new cli.QiniuClient(baseOptions["access_key"], baseOptions["secret_key"]);

        return rs;
    };

    var setOptions = function(opts){
        for (var key in opts){
            if (opts.hasOwnProperty(key)){
                baseOptions[key] = opts[key];
            }
        }
        requiredOptsChk();
    };

    var requiredOptsChk = function(){
        for (var key in baseOptions) {
            if (baseOptions[key] == "") {
                throw new Error("Error, missing " + key);
                break;
            }
        }
    };

    var mkEncodeEntryURI = function(key){
        return util.encode(rs.BUCKET + ':' + key);
    };

	/*
	 * func PutAuth() => PutAuthRet
	 * 上传授权（生成一个短期有效的可匿名上传URL）
	 */
    rs.putAuth = function(onret) {
        var url = rs.IO_HOST + '/put-auth/';
        rs.conn.callWith(url, null, onret);
    };

	/*
	 * func PutAuthEx(expires, callbackUrl) => PutAuthRet
	 * 上传授权（生成一个短期有效的可匿名上传URL）
	 */
    rs.putAuthEx = function(expires, callbackUrl, onret) {
        var url = rs.IO_HOST + '/put-auth/' + expires + '/callback/' + util.encode(callbackUrl);
        rs.conn.callWith(url, null, onret);
    };

	/*
	 * func Put(key string, mimeType string, fp File, bytes int64) => (data PutRet, code int, err Error)
	 * 上传一个流
	 */
    rs.put = function(key, mimeType, fp, bytes, onret) {
        if (!mimeType || mimeType === '') {
            mimeType = 'application/octet-stream';
        }
        var url = rs.IO_HOST + '/rs-put/' + mkEncodeEntryURI(key) + '/mimeType/' + util.encode(mimeType);
        var binary = new util.Binary(fp, bytes);
        rs.conn.callWith(url, binary, onret);
    };

	/*
	 * func PutFile(key string, mimeType string, localFile string) => (data PutRet, code int, err Error)
	 * 上传文件
	 */
    rs.putFile = function(key, mimeType, localFile, onret) {
        fs.stat(localFile, function(err, fi) {
            if (err) {
                onret({code: -1, error: err.toString(), detail: err});
                return;
            }
            var fp = fs.createReadStream(localFile);
            rs.put(key, mimeType, fp, fi.size, onret);
        });
    };

	/*
	 * func Get(key string, attName string) => GetRet
	 * 下载授权（生成一个短期有效的可匿名下载URL）
	 */
    rs.get = function(key, attName, onret) {
        var url = rs.RS_HOST + '/get/' + mkEncodeEntryURI(key) + '/attName/' + util.encode(attName);
        rs.conn.callWith(url, null, onret);
    };

	/*
	 * func GetIfNotModified(key string, attName string, base string) => GetRet
	 * 下载授权（生成一个短期有效的可匿名下载URL），如果服务端文件没被人修改的话（用于断点续传）
	 */
    rs.getIfNotModified = function(key, attName, base, onret) {
        var url = rs.RS_HOST + '/get/' + mkEncodeEntryURI(key) + '/attName/' + util.encode(attName) + '/base/' + base;
        rs.conn.callWith(url, null, onret);
    };

 	/*
	 * func Stat(key string) => Entry
	 * 取资源属性
	 */
    rs.stat = function(key, onret) {
        var url = rs.RS_HOST + '/stat/' + mkEncodeEntryURI(key);
        rs.conn.callWith(url, null, onret);
    };

	/*
	 * func Publish(domain string) => Bool
	 * 将本 Table 的内容作为静态资源发布。静态资源的url为：http://domain/key
	 */
    rs.publish = function(domain, onret) {
        var url = rs.RS_HOST + '/publish/' + util.encode(domain) + '/from/' + rs.BUCKET;
        rs.conn.callWith(url, null, onret);
    };

	/*
	 * func Unpublish(domain string) => Bool
	 * 取消发布
	 */
    rs.unpublish = function(domain, onret) {
        var url = rs.RS_HOST + '/unpublish/' + util.encode(domain);
        rs.conn.callWith(url, null, onret);
    };

	/*
	 * func Delete(key string) => Bool
	 * 删除资源
	 */
    rs.remove = function(key, onret) {
        var url = rs.RS_HOST + '/delete/' + mkEncodeEntryURI(key);
        rs.conn.callWith(url, null, onret);
    };

	/*
	 * func Drop() => Bool
	 * 删除整个表（慎用！）
	 */
    rs.drop = function(onret) {
        var url = rs.RS_HOST + '/drop/' + rs.BUCKET;
        rs.conn.callWith(url, null, onret);
    };

    return init();
}

exports.QiniuRS = QiniuRS;
