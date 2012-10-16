var qiniu = require('../index.js');
var mime = require('mime');

qiniu.conf.ACCESS_KEY = '<Please apply your access key>';
qiniu.conf.SECRET_KEY = '<Dont send your secret key to anyone>';

var key = __filename;
var friendName = key;
var bucket = 'qiniu_test_bucket';
var DEMO_DOMAIN = bucket + '.dn.qbox.me';

var conn = new qiniu.digestauth.Client();

qiniu.rs.mkbucket(conn, bucket, function(resp) {
  console.log("\n===> Make bucket result: ", resp);
  if (resp.code != 200) {
    return;
  }
});

var rs = new qiniu.rs.Service(conn, bucket);

var scpoe = bucket,
    expires = 3600,
    callbackUrl = null,
    callbackBodyType = "",
    customer = "sunikbear@gmail.com";
var token = new qiniu.token.UploadToken(scpoe, expires, callbackUrl, callbackBodyType, customer);
var uploadToken = token.generateToken();

var mimeType = mime.lookup(__filename);

console.log("Upload Token: ", uploadToken);
console.log("Mime Type: ", mimeType);

rs.drop(function(resp){
  console.log("\n===> Drop result: ", resp);
  if (resp.code != 200) {
    return;
  }

  var localFile = __filename;
  var customMeta = "";
  var callbackParams = {};
  var enableCrc32Check = false;

  rs.uploadWithToken(uploadToken, __filename, bucket, key, mimeType, customMeta, callbackParams, enableCrc32Check, function(resp){
    console.log("\n===> Upload File with Token result: ", resp);
    if (resp.code != 200) {
      return;
    }
    rs.publish(DEMO_DOMAIN, function(resp){
      console.log("\n===> Publish result: ", resp);
      if (resp.code != 200){
        return;
      }
      rs.stat(key, function(resp) {
		  	console.log("\n===> Stat result: ", resp);
		  	if (resp.code != 200) {
					return;
				}

				rs.get(key, friendName, function(resp) {
				  console.log("\n===> Get result: ", resp);
				  if (resp.code != 200) {
				    return;
				  }

				  rs.remove(key, function(resp) {
				    console.log("\n===> Delete result: ", resp);
				  });
				});
			});
    });
  });
});

