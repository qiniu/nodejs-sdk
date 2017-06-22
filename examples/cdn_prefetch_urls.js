const qiniu = require("../index.js");
const proc = require("process");

//初始化ak,sk
qiniu.conf.ACCESS_KEY = proc.env.QINIU_ACCESS_KEY;
qiniu.conf.SECRET_KEY = proc.env.QINIU_SECRET_KEY;

//URL 列表
var urlsToPrefetch = [
  'http://if-pbl.qiniudn.com/nodejs.png',
  'http://if-pbl.qiniudn.com/qiniu.jpg'
];

//预取链接
qiniu.cdn.prefetchUrls(urlsToPrefetch, function(err, respBody, respInfo) {
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
