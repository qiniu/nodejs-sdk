const qiniu = require("qiniu");

var domain = 'http://sq.qiniuts.com';
var fileName = "1491535764000.png";
//加密密钥
var encryptKey = '**';

var query = "imageView2/2/w/480/format/jpg"

var deadline = parseInt(Date.now() / 1000) + 3600;

var cdnManager = new qiniu.cdn.CdnManager(null);

var finalUrl = cdnManager.createTimestampAntiLeechUrl(domain, fileName, query,
  encryptKey, deadline);

console.log(finalUrl);
