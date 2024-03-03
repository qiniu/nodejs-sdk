const qiniu = require('qiniu');

const accessKey = process.env.QINIU_ACCESS_KEY;
const secretKey = process.env.QINIU_SECRET_KEY;
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const config = new qiniu.conf.Config();
const bucketManager = new qiniu.rs.BucketManager(mac, config);

const srcBucket = process.env.QINIU_TEST_BUCKET;
const srcKey = 'qiniu.mp4';
const destBucket = srcBucket;

// 每个operations的数量不可以超过1000个，如果总数量超过1000，需要分批发送
const copyOperations = [
    qiniu.rs.copyOp(srcBucket, srcKey, destBucket, 'qiniu1.mp4', {
        force: true
    }),
    qiniu.rs.copyOp(srcBucket, srcKey, destBucket, 'qiniu2.mp4'),
    qiniu.rs.copyOp(srcBucket, srcKey, destBucket, 'qiniu3.mp4'),
    qiniu.rs.copyOp(srcBucket, srcKey, destBucket, 'qiniu4.mp4')
];

bucketManager.batch(copyOperations)
    .then(({ data, resp }) => {
        if (Math.floor(resp.statusCode / 100) === 2) {
            data.forEach(function (item) {
                if (item.code === 200) {
                    console.log('success', item.data);
                } else {
                    console.log(item.code + '\t' + item.data.error);
                }
            });
        } else {
            console.log(resp.statusCode);
            console.log(data);
        }
    })
    .catch(err => {
        console.log('failed', err);
    });
