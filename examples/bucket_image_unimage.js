const qiniu = require("qiniu");
const proc = require("process");

var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var config = new qiniu.conf.Config();
var bucketManager = new qiniu.rs.BucketManager(mac, config);
var bucket = "if-pbl";
var srcSiteUrl = "http://www.baidu.com/";
var srcHost = null;

bucketManager.image(bucket, srcSiteUrl, srcHost, function(err, respBody,
  respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    console.log(respInfo.statusCode);

    //unimage
    bucketManager.unimage(bucket, function(err1, respBody1, respInfo1) {
      if (err1) {
        throw err;
      }
      console.log(respInfo1.statusCode);
    });
  }

});
