const qiniu = require('qiniu');

const accessKey = process.env.QINIU_ACCESS_KEY;
const secretKey = process.env.QINIU_SECRET_KEY;
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const config = new qiniu.conf.Config();
// config.useHttpsDomain = true;
config.regionsProvider = qiniu.httpc.Region.fromRegionId('z0');
const bucketManager = new qiniu.rs.BucketManager(mac, config);
const bucket = process.env.QINIU_TEST_BUCKET;
const key = 'qiniux.mp4';

bucketManager.stat(bucket, key)
    .then(({ data, resp }) => {
        if (resp.statusCode === 200) {
            console.log(data.hash);
            console.log(data.fsize);
            console.log(data.mimeType);
            console.log(data.putTime);
            console.log(data.type);
        } else {
            console.log(resp.statusCode);
            console.log(data);
        }
    })
    .catch(err => {
        console.log('failed', err);
    });
