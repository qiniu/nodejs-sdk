const qiniu = require('../index.js');

const bucket = process.env.QINIU_TEST_BUCKET;
const accessKey = process.env.QINIU_ACCESS_KEY;
const secretKey = process.env.QINIU_SECRET_KEY;
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const options = {
    scope: bucket
};
const putPolicy = new qiniu.rs.PutPolicy(options);

const uploadToken = putPolicy.uploadToken(mac);
const config = new qiniu.conf.Config();
const localFile = '/path/to/file';
config.regionsProvider = qiniu.httpc.Region.fromRegionId('z0');
config.useCdnDomain = true;
const resumeUploader = new qiniu.resume_up.ResumeUploader(config);
const putExtra = new qiniu.resume_up.PutExtra();
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
resumeUploader.putFile(uploadToken, null, localFile, putExtra)
    .then(({ data, resp }) => {
        if (resp.statusCode === 200) {
            console.log(data);
        } else {
            console.log(resp.statusCode);
            console.log(data);
        }
    })
    .catch(err => {
        console.log('failed', err);
    });
