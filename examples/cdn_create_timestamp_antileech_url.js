const qiniu = require("/Users/smile/qiniu/qiniu-sdk/node/node_modules/qiniu");

var domain = 'https://qiniu.com';
var fileName = "xx";
//加密密钥
var encryptKey = '**';
var query = null

var deadline = parseInt(Date.now() / 1000) + 3600;

var cdnManager = new qiniu.cdn.CdnManager(null);

var finalUrl = cdnManager.createTimestampAntiLeechUrl(domain, fileName, query,
  encryptKey, deadline);

console.log(finalUrl);
