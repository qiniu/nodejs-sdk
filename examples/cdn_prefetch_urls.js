const qiniu = require("qiniu");
const proc = require("process");


//URL 列表
var urlsToPrefetch = [
  'http://if-pbl.qiniudn.com/nodejs.png',
  'http://if-pbl.qiniudn.com/qiniu.jpg'
];
var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var cdnManager = new qiniu.cdn.CdnManager(mac);
//预取链接
cdnManager.prefetchUrls(urlsToPrefetch, function(err, respBody, respInfo) {
  if (err) {
    throw err;
  }

  console.log(respInfo.statusCode);
  if (respInfo.statusCode == 200) {
    var jsonBody = JSON.parse(respBody);
    console.log(jsonBody.code);
    console.log(jsonBody.error);
    console.log(jsonBody.requestId);
    console.log(jsonBody.invalidUrls);
    console.log(jsonBody.invalidDirs);
    console.log(jsonBody.urlQuotaDay);
    console.log(jsonBody.urlSurplusDay);
    console.log(jsonBody.dirQuotaDay);
    console.log(jsonBody.dirSurplusDay);
  }
});
