const qiniu = require("qiniu");
const proc = require("process");

var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;

var bucket = proc.env.QINIU_TEST_BUCKET;

var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var config = new qiniu.conf.Config();
config.zone = qiniu.zone.Zone_z0;
config.useHttpsDomain = "https";
var bucketManager = new qiniu.rs.BucketManager(mac, config);
// @param bucketName 空间名
bucketManager.getBucketInfo(bucket, function(err, respBody, respInfo) {
    if (err) {
        console.log(err);
        throw err;
    }
    if (respInfo.status == 200) {
        console.log("---respBody\n" + JSON.stringify(respBody) + "\n---");
        console.log("---respInfo\n" + JSON.stringify(respInfo) + "\n---");
    }
});
