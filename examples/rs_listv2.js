const qiniu = require("qiniu");
const proc = require("process");

var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var config = new qiniu.conf.Config();
//config.useHttpsDomain = true;
config.zone = qiniu.zone.Zone_z0;
var bucketManager = new qiniu.rs.BucketManager(mac, config);
var srcBucket = proc.env.QINIU_TEST_BUCKET;
// @param options 列举操作的可选参数
//                prefix    列举的文件前缀
//                marker    上一次列举返回的位置标记，作为本次列举的起点信息
//                limit     每次返回的最大列举文件数量
//                delimiter 指定目录分隔符
var options = {
    limit: 20,
};

bucketManager.listPrefixV2(srcBucket, options, function (err, respBody, respInfo) {
    //the irregular data return from Server that Cannot be converted by urllib to JSON Object
    //so err !=null and you can judge if err.res.statusCode==200
    if (err.res.statusCode != 200) {
        console.log(err);
        throw err;
    }

    console.log("---respBody\n" + respBody + "\n---");
    console.log("---respInfo\n" + JSON.stringify(respInfo) + "\n---");
});
