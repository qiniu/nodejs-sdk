const qiniu = require('qiniu');

const accessKey = process.env.QINIU_ACCESS_KEY;
const secretKey = process.env.QINIU_SECRET_KEY;
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const config = new qiniu.conf.Config();
const bucketManager = new qiniu.rs.BucketManager(mac, config);
const publicBucketDomain = 'http://if-pbl.qiniudn.com';
const privateBucketDomain = 'http://if-pri.qiniudn.com';
const key = 'qiniu.mp4';

// public
const publicDownloadUrl = bucketManager.publicDownloadUrl(publicBucketDomain, key);
console.log(publicDownloadUrl);

// private
const deadline = parseInt(Date.now() / 1000) + 3600; // 1小时过期
const privateDownloadUrl = bucketManager.privateDownloadUrl(privateBucketDomain,
    key,
    deadline);
console.log(privateDownloadUrl);
