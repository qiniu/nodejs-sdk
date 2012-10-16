var qiniu = require('../index.js');
var mime = require('mime');

qiniu.conf.ACCESS_KEY = '<Please apply your access key>';
qiniu.conf.SECRET_KEY = '<Dont send your secret key to anyone>';

var bucket = 'test_image_bucket';
var key = 'test.jpg'; // test.jpg must exists
var friendlyName = key;

var newkey = "test-cropped.jpg";
var thumbnails_bucket = 'thumbnails_bucket';
var DEMO_DOMAIN = 'iovip.qbox.me/' + thumbnails_bucket;

var conn = new qiniu.digestauth.Client();

qiniu.rs.mkbucket(conn, bucket, function(resp) {
  console.log("\n===> Make bucket result: ", resp);
  if (resp.code != 200) {
    return;
  }
});

var rs = new qiniu.rs.Service(conn, bucket);
var imgrs = new qiniu.rs.Service(conn, thumbnails_bucket);

var scpoe = bucket,
    expires = 3600,
    callbackUrl = null,
    callbackBodyType = "",
    customer = "sunikbear@gmail.com";
var token = new qiniu.token.UploadToken(scpoe, expires, callbackUrl, callbackBodyType, customer);
var uploadToken = token.generateToken();
var mimeType = mime.lookup(key);

rs.drop(function(resp) {
	console.log("\n===> Drop result: ", resp);
  var customMeta = "";
  var callbackParams = {};
  var enableCrc32Check = false;

  rs.uploadWithToken(uploadToken, key, bucket, key, mimeType, customMeta, callbackParams, enableCrc32Check, function(resp){
	  console.log("\n===> Upload File with Token result: ", resp);
	  if (resp.code != 200) {
		  return;
	  }

    rs.get(key, friendlyName, function(resp) {
      console.log("\n===> Get result: ", resp);
      if (resp.code != 200) {
        return;
      }
      var options = {
        "thumbnail": "!120x120r",
        "gravity": "center",
        "crop": "!120x120a0a0",
        "quality": 85,
        "rotate": 45,
        "format": "jpg",
        "auto_orient": true
      };

      console.log("\n===> thumbnail url is: ", qiniu.img.mogrify(resp.data.url, options));

      imgrs.imageMogrifyAs(newkey, resp.data.url, options, function(resp){
        console.log("\n===> imageMogrifyAs result: ", resp);
        if (resp.code != 200) {
          return;
        }
        imgrs.publish(DEMO_DOMAIN, function(resp) {
          console.log("\n===> Publish result: ", resp);
          if (resp.code != 200) {
            return;
          }
        });
      });
	  });
	});
});
