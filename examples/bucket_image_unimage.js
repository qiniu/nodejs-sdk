const qiniu = require('qiniu');

const accessKey = process.env.QINIU_ACCESS_KEY;
const secretKey = process.env.QINIU_SECRET_KEY;
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const config = new qiniu.conf.Config();
const bucketManager = new qiniu.rs.BucketManager(mac, config);
const bucket = 'if-pbl';
const srcSiteUrl = 'http://www.baidu.com/';
const srcHost = null;

bucketManager.image(
    bucket,
    srcSiteUrl,
    srcHost
)
    .then(({ data, resp }) => {
        console.log('image status code', resp.statusCode);
        return bucketManager.unimage(bucket);
    })
    .then(({ data, resp }) => {
        console.log('unimage status code', resp.statusCode);
    })
    .catch(err => {
        console.log(err);
    });
