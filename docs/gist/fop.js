var qiniu = require('../../');

qiniu.conf.ACCESS_KEY = '8Y7uZY0cqHxAyGK27V_B2Bxf8IhAkqEPOHr6iwwc';
qiniu.conf.SECRET_KEY = '1uvFVvk9IqFRQ6t4TCr-DdeXybTbSS0gauJrYiJN';

var domain = 'test369.qiniudn.com';
var key = 'logo.png';
// @gist makeImageInfoUrl
// 生成访问图片的url
var url = qiniu.rs.makeBaseUrl(domain, key);

// 生成fop_url
var ii = new qiniu.fop.ImageInfo();
url = ii.makeRequest(url);

// 签名，生成private_url。如果是公有bucket则此步可以省略
// 服务端操作使用，或者发送给客户端
var policy = new qiniu.rs.GetPolicy();
url = policy.makeRequest(url);

console.log('在浏览器输入: ' + url);
// @endgist

// @gist makeExifUrl
// 生成访问图片的url
var url = qiniu.rs.makeBaseUrl(domain, key);

// 生成fop_url
var exif = new qiniu.fop.Exif();
url = exif.makeRequest(url);

// 签名，生成private_url。如果是公有bucket则此步可以省略
// 服务端操作使用，或者发送给客户端
var policy = new qiniu.rs.GetPolicy();
url = policy.makeRequest(url);

console.log('在浏览器输入: ' + url);
// @endgist

// @gist makeImageViewUrl

// 生成访问图片的url
var url = qiniu.rs.makeBaseUrl(domain, key);

// 生成fop_url
var iv = new qiniu.fop.ImageView();
iv.width = 100;
url = iv.makeRequest(url);

// 签名，生成private_url。如果是公有bucket则此步可以省略
// 服务端操作使用，或者发送给客户端
var policy = new qiniu.rs.GetPolicy();
url = policy.makeRequest(url);

console.log('在浏览器输入: ' + url);
// @endgist
