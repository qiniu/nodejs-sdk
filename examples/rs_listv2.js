const qiniu = require('qiniu');

const accessKey = process.env.QINIU_ACCESS_KEY;
const secretKey = process.env.QINIU_SECRET_KEY;
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const config = new qiniu.conf.Config();
// config.useHttpsDomain = true;
config.regionsProvider = qiniu.httpc.Region.fromRegionId('z0');
const bucketManager = new qiniu.rs.BucketManager(mac, config);
const srcBucket = process.env.QINIU_TEST_BUCKET;
// @param options 列举操作的可选参数
//                prefix    列举的文件前缀
//                marker    上一次列举返回的位置标记，作为本次列举的起点信息
//                limit     每次返回的最大列举文件数量
//                delimiter 指定目录分隔符
const options = {
    limit: 20
};

bucketManager.listPrefixV2(srcBucket, options)
    .then(({ data, resp }) => {
        if (resp.statusCode === 200 && typeof data === 'string') {
            data.split('\n').forEach(itemStr => {
                const item = JSON.parse(itemStr);
                console.log(item.key);
            });
        } else {
            console.log(resp.statusCode);
            console.log(data);
        }
    })
    .catch(err => {
        console.log('failed', err);
    });
