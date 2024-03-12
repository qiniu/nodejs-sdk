const qiniu = require('qiniu');

const accessKey = process.env.QINIU_ACCESS_KEY;
const secretKey = process.env.QINIU_SECRET_KEY;

const bucket = process.env.QINIU_TEST_BUCKET;

const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const config = new qiniu.conf.Config();
config.regionsProvider = qiniu.httpc.Region.fromRegionId('z0');
config.useHttpsDomain = 'https';
const bucketManager = new qiniu.rs.BucketManager(mac, config);
// @param bucketName 空间名
bucketManager.getBucketInfo(bucket)
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
