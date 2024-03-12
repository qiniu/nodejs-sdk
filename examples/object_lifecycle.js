const qiniu = require('../index');

const accessKey = process.env.QINIU_ACCESS_KEY;
const secretKey = process.env.QINIU_SECRET_KEY;
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const config = new qiniu.conf.Config();
config.useHttpsDomain = true;
// config.zone = qiniu.zone.Zone_z0;
const bucketManager = new qiniu.rs.BucketManager(mac, config);
const bucket = process.env.QINIU_TEST_BUCKET;
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
)
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
