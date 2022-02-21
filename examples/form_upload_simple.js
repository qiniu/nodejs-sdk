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
var localFile = '/Users/jemy/Downloads/download.csv';
// config.zone = qiniu.zone.Zone_z0;
var formUploader = new qiniu.form_up.FormUploader(config);
var putExtra = new qiniu.form_up.PutExtra();
// file
putExtra.fname = 'test01.csv';
putExtra.crc32 = 3497766758;
putExtra.metadata = {
    'x-qn-meta-name': 'qiniu'
};
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
