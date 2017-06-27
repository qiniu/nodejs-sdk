const qiniu = require("qiniu");
const proc = require("process");

var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var config = new qiniu.conf.Config();
//config.useHttpsDomain = true;
config.zone = qiniu.zone.Zone_z0;
var bucketManager = new qiniu.rs.BucketManager(mac, config);
var srcBucket = "if-pbl";
var srcKey = "qiniu.mp4";
var destBucket = "if-pbl";
var destKey = "qiniu_new.mp4";
var options = {
  force: true
}
bucketManager.move(srcBucket, srcKey, destBucket, destKey, options, function(
  err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    //200 is success
    console.log(respInfo.statusCode);
  }

});
