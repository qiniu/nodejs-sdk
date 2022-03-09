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
config.zone = qiniu.zone.Zone_z0;
config.useCdnDomain = true;
var resumeUploader = new qiniu.resume_up.ResumeUploader(config);
var putExtra = new qiniu.resume_up.PutExtra();
putExtra.params = {
    'x:name': '',
    'x:age': 27
};
putExtra.metadata = {
    'x-qn-meta-name': 'qiniu'
};
putExtra.fname = 'testfile.mp4';
putExtra.resumeRecordFile = 'progress.log';
putExtra.progressCallback = function (uploadBytes, totalBytes) {
    console.log('progress:' + uploadBytes + '(' + totalBytes + ')');
};

// file
resumeUploader.putFile(uploadToken, null, localFile, putExtra, function (respErr,
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
