const qiniu = require("../index");
const proc = require("process");

var mac = new qiniu.auth.digest.Mac("MP_Ebql_lSsUrDr7WrXn_5vKocQDLvTPCNEFeVmp", "YZlfOKeuQVA0h7yuCJrkdcYlbcGYwEP7A8YVG9-P");
var config = new qiniu.conf.Config();
config.zone = qiniu.zone.Zone_z0;
config.useHttpsDomain = "https";
var bucketManager = new qiniu.rs.BucketManager(mac, config);
// @param bucketName 空间名
bucketManager.getBucketInfo("androidtest", function(err, respBody, respInfo) {
    if (err) {
        console.log(err);
        throw err;
    }
    if (respInfo.status == 200) {
        console.log("---respBody\n" + JSON.stringify(respBody) + "\n---");
        console.log("---respInfo\n" + JSON.stringify(respInfo) + "\n---");
    }
});
