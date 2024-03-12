const qiniu = require('qiniu');

const accessKey = process.env.QINIU_ACCESS_KEY;
const secretKey = process.env.QINIU_SECRET_KEY;
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const config = new qiniu.conf.Config();
// config.useHttpsDomain = true;
config.zone = qiniu.httpc.Region.fromRegionId('z0');
const bucketManager = new qiniu.rs.BucketManager(mac, config);
const srcBucket = process.env.QINIU_TEST_BUCKET;
const srcKey = 'qiniu.mp4';
const destBucket = 'destBucket';
const destKey = 'qiniu_new_copy.mp4';
const options = {
    force: true
};

bucketManager.copy(srcBucket, srcKey, destBucket, destKey, options)
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
