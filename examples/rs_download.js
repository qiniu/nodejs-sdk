const qiniu = require("qiniu");
const proc = require("process");

var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var config = new qiniu.conf.Config();
var bucketManager = new qiniu.rs.BucketManager(mac, config);
var publicBucketDomain = 'http://if-pbl.qiniudn.com';
var privateBucketDomain = 'http://if-pri.qiniudn.com';
var key = 'qiniu.mp4';

//public
var publicDownloadUrl = bucketManager.publicDownloadUrl(publicBucketDomain, key);
console.log(publicDownloadUrl);

//private
var deadline = parseInt(Date.now() / 1000) + 3600; //1小时过期
var privateDownloadUrl = bucketManager.privateDownloadUrl(privateBucketDomain,
  key,
  deadline);
console.log(privateDownloadUrl);
