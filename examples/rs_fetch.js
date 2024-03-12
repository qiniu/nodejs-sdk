const qiniu = require('qiniu');
const proc = require('process');

const accessKey = proc.env.QINIU_ACCESS_KEY;
const secretKey = proc.env.QINIU_SECRET_KEY;
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const config = new qiniu.conf.Config();
// config.useHttpsDomain = true;
// config.regionsProvider = qiniu.httpc.Region.fromRegionId('z0');
const bucketManager = new qiniu.rs.BucketManager(mac, config);
const resUrl = 'http://devtools.qiniu.com/qiniu.png';
const bucket = proc.env.QINIU_TEST_BUCKET;
const key = 'qiniu.png';

bucketManager.fetch(resUrl, bucket, key)
    .then(({ data, resp }) => {
        if (resp.statusCode === 200) {
            console.log(data.key);
            console.log(data.hash);
            console.log(data.fsize);
            console.log(data.mimeType);
        } else {
            console.log(resp.statusCode);
            console.log(data);
        }
    })
    .catch(err => {
        console.log('failed', err);
    });
