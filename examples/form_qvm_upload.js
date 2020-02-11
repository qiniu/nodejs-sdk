const qiniu = require('../index.js');
const proc = require('process');

var bucket = proc.env.QINIU_TEST_BUCKET;
var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var options = {
    scope: bucket
};
var putPolicy = new qiniu.rs.PutPolicy(options);

var uploadToken = putPolicy.uploadToken(mac);
var config = new qiniu.conf.Config();
var localFile = '/Users/jemy/Documents/qiniu.mp4';
// config.zone = qiniu.zone.Zone_z0;

// construct a new zone
// 华东
var ZONE_QVM_Z0 = new qiniu.conf.Zone([
    'free-qvm-z0-xs.qiniup.com'
], [
    'free-qvm-z0-xs.qiniup.com'
], 'iovip.qbox.me',
'rs.qbox.me',
'rsf.qbox.me',
'api.qiniu.com');

// 华北
var ZONE_QVM_Z1 = new qiniu.conf.Zone([
    'free-qvm-z1-zz.qiniup.com'
], [
    'free-qvm-z1-zz.qiniup.com'
], 'iovip-z1.qbox.me',
'rs-z1.qbox.me',
'rsf-z1.qbox.me',
'api-z1.qiniu.com');

config.zone = ZONE_QVM_Z0;
config.zone = ZONE_QVM_Z1;
var formUploader = new qiniu.form_up.FormUploader(config);
var putExtra = new qiniu.form_up.PutExtra();
// bytes
formUploader.put(uploadToken, null, 'hello', null, function (respErr,
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

// file
formUploader.putFile(uploadToken, null, localFile, putExtra, function (respErr,
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
