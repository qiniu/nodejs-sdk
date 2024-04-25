const qiniu = require('../index');

const accessKey = process.env.QINIU_ACCESS_KEY;
const secretKey = process.env.QINIU_SECRET_KEY;
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const config = new qiniu.conf.Config();
// config.useHttpsDomain = true;
config.regionsProvider = qiniu.httpc.Region.fromRegionId('z0');
const bucketManager = new qiniu.rs.BucketManager(mac, config);

const bucket = process.env.QINIU_TEST_BUCKET;
// @param options 列举操作的可选参数
//                prefix    列举的文件前缀
//                marker    上一次列举返回的位置标记，作为本次列举的起点信息
//                limit     每次返回的最大列举文件数量
//                delimiter 指定目录分隔符
const options = {
    limit: 10,
    prefix: 'calculus'
};

bucketManager.listPrefix(bucket, options)
    .then(({ data, resp }) => {
        if (resp.statusCode === 200) {
            // 如果这个nextMarker不为空，那么还有未列举完毕的文件列表，下次调用listPrefix的时候，
            // 指定options里面的marker为这个值
            const nextMarker = data.marker;
            const commonPrefixes = data.commonPrefixes;
            console.log(nextMarker);
            console.log({ commonPrefixes });
            const items = data.items;
            items.forEach(function (item) {
                console.log(item.key);
                // console.log(item.putTime);
                // console.log(item.hash);
                // console.log(item.fsize);
                // console.log(item.mimeType);
                // console.log(item.endUser);
                // console.log(item.type);
            });
        } else {
            console.log(resp.statusCode);
            console.log(data);
        }
    })
    .catch(err => {
        console.log('failed', err);
    });
