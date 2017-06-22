const qiniu = require("../index.js");
const proc = require("process");

//初始化ak,sk
qiniu.conf.ACCESS_KEY = proc.env.QINIU_ACCESS_KEY;
qiniu.conf.SECRET_KEY = proc.env.QINIU_SECRET_KEY;

//URL 列表
var urlsToRefresh = [
  'http://if-pbl.qiniudn.com/nodejs.png',
  'http://if-pbl.qiniudn.com/qiniu.jpg'
];

//DIR 列表
var dirsToRefresh = [
  'http://if-pbl.qiniudn.com/examples/',
  'http://if-pbl.qiniudn.com/images/'
];

//刷新链接
qiniu.cdn.refreshUrls(urlsToRefresh, function(err, respBody, respInfo) {
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

//刷新目录，刷新目录需要联系七牛技术支持开通权限
qiniu.cdn.refreshDirs(dirsToRefresh, function(err, respBody, respInfo) {
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

//一起刷新
qiniu.cdn.refreshUrlsAndDirs(urlsToRefresh, dirsToRefresh, function(err,
  respBody, respInfo) {
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
