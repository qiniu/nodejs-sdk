const qiniu = require("../index.js");
const proc = require("process");

var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var putPolicy = new qiniu.rs.PutPolicy({
  scope: 'if-pbl'
});

var uploadToken = putPolicy.uploadToken(mac);
var config = new qiniu.conf.Config();
//config.zone = qiniu.zone.Zone_z0;
var formUploader = new qiniu.form_io.FormUploader(config);
formUploader.put(uploadToken, null, "hello", null, function(respErr,
  respBody, respInfo) {
  if (respErr) {
    throw respErr;
  }

  if (respInfo.statusCode == 200) {
    console.log(respBody);
  } else {
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
