const qiniu = require('../index');
const proc = require('process');

const accessKey = proc.env.QINIU_ACCESS_KEY;
const secretKey = proc.env.QINIU_SECRET_KEY;
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const config = new qiniu.conf.Config();
config.useHttpsDomain = true;
// config.zone = qiniu.zone.Zone_z0;
const bucketManager = new qiniu.rs.BucketManager(mac, config);
const bucket = proc.env.QINIU_TEST_BUCKET;
const key = 'test_file';

bucketManager.setObjectLifeCycle(
    bucket,
    key,
    {
        toIaAfterDays: 10,
        toArchiveAfterDays: 20,
        toDeepArchiveAfterDays: 30,
        deleteAfterDays: 40
    },
    function (err, respBody, respInfo) {
        if (err) {
            console.log(err);
            console.log(respInfo);
        }
        console.log(respBody);
    }
);
