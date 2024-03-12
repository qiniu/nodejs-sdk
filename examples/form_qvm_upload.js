const qiniu = require('../index.js');

const bucket = process.env.QINIU_TEST_BUCKET;
const accessKey = process.env.QINIU_ACCESS_KEY;
const secretKey = process.env.QINIU_SECRET_KEY;
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
const options = {
    scope: bucket
};
const putPolicy = new qiniu.rs.PutPolicy(options);

const uploadToken = putPolicy.uploadToken(mac);
const config = new qiniu.conf.Config();
const localFile = '/path/to/file';

// construct a new zone
// 华东
const ZONE_QVM_Z0 = qiniu.httpc.Region.fromRegionId('z0');
ZONE_QVM_Z0.services[qiniu.httpc.SERVICE_NAME.UP] = [
    'free-qvm-z0-xs.qiniup.com'
].map(h => new qiniu.httpc.Endpoint(h));

// 华北
const ZONE_QVM_Z1 = qiniu.httpc.Region.fromRegionId('z1');
ZONE_QVM_Z1.services[qiniu.httpc.SERVICE_NAME.UP] = [
    'free-qvm-z1-zz.qiniup.com'
].map(h => new qiniu.httpc.Endpoint(h));

config.regionsProvider = ZONE_QVM_Z0;
config.regionsProvider = ZONE_QVM_Z1;
const formUploader = new qiniu.form_up.FormUploader(config);
const putExtra = new qiniu.form_up.PutExtra();
// bytes
formUploader.put(
    uploadToken,
    null,
    'hello',
    null
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
        console.log('put failed', err);
    });

// file
formUploader.putFile(uploadToken, null, localFile, putExtra)
    .then(({ data, resp }) => {
        if (resp.statusCode === 200) {
            console.log(data);
        } else {
            console.log(resp.statusCode);
            console.log(data);
        }
    })
    .catch(err => {
        console.log('putFile failed', err);
    });
