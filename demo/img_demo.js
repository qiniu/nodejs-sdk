var qiniu = require('../index.js');
var mime = require('mime');

qiniu.conf.ACCESS_KEY = '<Please apply your access key>';
qiniu.conf.SECRET_KEY = '<Dont send your secret key to anyone>';

var key = 'test.jpg'; // test.jpg must exists
var friendlyName = key;

var newkey = "test-cropped.jpg";
var thumbnails_bucket = 'thumbnails_bucket';
var DEMO_DOMAIN = thumbnails_bucket + '.dn.qbox.me';

var conn = new qiniu.digestauth.Client();

qiniu.rs.mkbucket(conn, thumbnails_bucket, function(resp) {
  console.log("\n===> Make thumbnails bucket result: ", resp);
  if (resp.code != 200) {
    return;
  }
  var opts = {
    scope: thumbnails_bucket,
    expires: 3600,
    callbackUrl: null,
    callbackBodyType: null,
    customer: "sunikbear@gmail.com"
  };
  var token = new qiniu.auth.UploadToken(opts);
  var uploadToken = token.generateToken();
  var mimeType = mime.lookup(key);
 
  var imgrs = new qiniu.rs.Service(conn, thumbnails_bucket); 

  var localFile = key,
      customMeta = "",
      callbackParams = {},
      enableCrc32Check = false;

  imgrs.uploadFileWithToken(uploadToken, localFile, thumbnails_bucket, key, mimeType, customMeta, callbackParams, enableCrc32Check, function(resp){
	  console.log("\n===> Upload Image with Token result: ", resp);
	  if (resp.code != 200) {
      clear(imgrs);
		  return;
	  }

    imgrs.publish(DEMO_DOMAIN, function(resp) {
      console.log("\n===> Publish result: ", resp);
      if (resp.code != 200) {
        clear(imgrs);
        return;
      }

      imgrs.get(key, friendlyName, function(resp) {
        console.log("\n===> Get result: ", resp);
        if (resp.code != 200) {
          clear(imgrs);
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
            clear(imgrs);
            return;
          }

          imgrs.stat(key, function(resp) {
		  	    console.log("\n===> Stat result: ", resp);
		  	    if (resp.code != 200) {
              clear(imgrs);
					    return;
				    }
	
            imgrs.remove(key, function(resp) {
              clear(imgrs);
				      console.log("\n===> Delete result: ", resp);
 				    });
			    });
        });
      });
	  });
	});
});

function clear(imgrs){
  imgrs.drop(function(resp){
    console.log("\n===> Drop result: ", resp);
  });
}
