const qiniu = require("qiniu");
const proc = require("process");

var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;
var bucket = proc.env.QINIU_TEST_BUCKET;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var putPolicy = new qiniu.rs.PutPolicy({
  scope: bucket
});

var uploadToken = putPolicy.uploadToken(mac);
console.log(uploadToken);
