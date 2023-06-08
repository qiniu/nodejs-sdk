const os = require('os');

const qiniu = require('qiniu');

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
const localFile = os.homedir() + '/Downloads/83eda6926b94bb14.css';
// config.zone = qiniu.zone.Zone_z0;
const formUploader = new qiniu.form_up.FormUploader(config);
const putExtra = new qiniu.form_up.PutExtra();
// file
// putExtra.fname = 'frontend-static-resource/widgets/_next/static/css/83eda6926b94bb14.css';
// putExtra.metadata = {
//     'x-qn-meta-name': 'qiniu'
// };
formUploader.putFile(
    uploadToken,
    'frontend-static-resource/widgets/_next/static/css/83eda6926b94bb14.css',
    localFile,
    putExtra,
    function (respErr,
        respBody, respInfo) {
        if (respErr) {
            throw respErr;
        }

        if (respInfo.statusCode === 200) {
            console.log(respBody);
        } else {
            console.log(respInfo.statusCode);
            console.log(respBody);
        }
    }
);
