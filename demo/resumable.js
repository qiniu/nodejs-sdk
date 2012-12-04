var fs = require("fs");
var mime = require('mime');
var qiniu = require('../index.js');

qiniu.conf.ACCESS_KEY = 'L1-jLRHQoeKzZTNEbKllYdUFX3GbpoqKIuuy8zPe';
qiniu.conf.SECRET_KEY = 'YCPWm5CDIEO7x1ZYarEHQ97fZYi4M4q9T8InM_zt';

var key = "SocialFolders.pkg";

var friendName = key;
var bucket = 'qiniu_test_bucket';
var DEMO_DOMAIN = bucket + '.dn.qbox.me';

var conn = new qiniu.digestauth.Client();

// 创建一个大文件，时间较长，可以自己选定一个已存在的大文件进行上传
/*
for (var i = 0; i < 10000000; i++) {
  var random = Math.floor((Math.random()*10)+1);
  random = random.toString() + " ";
  fs.appendFileSync(key, random);
}
*/

qiniu.rs.mkbucket(conn, bucket, function(resp) {
  console.log("\n===> Make bucket result: ", resp);
  if (resp.code != 200) {
    return;
  }
  var opts = {
    scope: bucket,
    expires: 3600,
    callbackUrl: null,
    callbackBodyType: null,
    customer: null
  };
  var token = new qiniu.auth.UploadToken(opts);
  var uploadToken = token.generateToken();
  var mimeType = mime.lookup(key);

  var localFile = key,
      customMeta = "",
      customer = null,
      callbackParams = {},
      enableCrc32Check = false;

  var rs = new qiniu.rs.Service(conn, bucket);
  var resumable = new qiniu.up.ResumableUpload(conn, uploadToken, bucket, key, mimeType, customMeta, customer, callbackParams);
  
  var result = resumable.upload(key, function(resp){
    rs.get(key, friendName, function(resp) {
      console.log("\n===> Get result: ", resp);
      if (resp.code != 200) {
          clear(rs);
          return;
      }

      rs.remove(key, function(resp) {
          clear(rs);
          console.log("\n===> Delete result: ", resp);
          fs.unlink(key, function(resp){
            console.log("Big file deleted.");
          });
      });
    });

    console.log(resp);
    if (Math.floor(resp.code/100) === 2) {
      console.log("Upload Success(from ResumableUpload)!");
    }
  });
});

function clear(rs) {
  rs.drop(function(resp){
    console.log("\n===> Drop result: ", resp);
  });
}