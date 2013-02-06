var qiniu = require('../index.js');
var mime = require('mime');

qiniu.conf.ACCESS_KEY = '<Please apply your access key>';
qiniu.conf.SECRET_KEY = '<Dont send your secret key to anyone>';

var key = 'test.jpg'; // test.jpg must exists
var friendlyName = key;

var newkey = "test-cropped.jpg";
var thumbnails_bucket = 'thumbnails';
var DEMO_DOMAIN = thumbnails_bucket + '.qiniudn.com';

var conn = new qiniu.digestauth.Client();

qiniu.rs.mkbucket(conn, thumbnails_bucket, function(err, data) {
  if (err) {
    console.log("\n ===> Make bucket error: ", err);
    return;
  }
  console.log("\n===> Make thumbnails bucket result: ", data);
  var opts = {
    scope: thumbnails_bucket,
    expires: 3600,
    callbackUrl: null,
    callbackBodyType: null,
    customer: null
  };
  var policy = new qiniu.auth.PutPolicy(opts);
  var uploadToken = policy.generateToken();
  var mimeType = mime.lookup(key);

  var imgrs = new qiniu.rs.Service(conn, thumbnails_bucket);

  var localFile = key,
      customMeta = "",
      callbackParams = {},
      enableCrc32Check = false;

  imgrs.uploadFileWithToken(uploadToken, localFile, key, mimeType, customMeta, callbackParams, enableCrc32Check, function(err, data) {
      if (err) {
        console.log("\n ===> Upload Image with Token Error: ", err);
        clear(imgrs);
        return;
      }
      console.log("\n===> Upload Image with Token result: ", data);

      imgrs.publish(DEMO_DOMAIN, function(err, data) {
          if (err) {
            console.log("\n ===> Publish error: ", err);
            clear(imgrs);
            return;
          }
          console.log("\n===> Publish result: ", data);

          imgrs.get(key, friendlyName, function(err, data) {
              if (err) {
                clear(imgrs);
                console.log("\n ===> Get error: ", err);
                return;
              }
              console.log("\n===> Get result: ", data);

              var options = {
                  "thumbnail": "!120x120r",
                  "gravity": "center",
                  "crop": "!120x120a0a0",
                  "quality": 85,
                  "rotate": 45,
                  "format": "jpg",
                  "auto_orient": true
              };

              console.log("\n===> thumbnail url is: ", qiniu.img.mogrify(data.detail.url, options));

              imgrs.imageMogrifyAs(newkey, data.detail.url, options, function(err, data){
                  if (err) {
                    clear(imgrs);
                    console.log("\n ===> imageMogrifyAs error: ", err);
                    return;
                  }
                  console.log("\n===> imageMogrifyAs result: ", data);

                  imgrs.stat(key, function(err, data) {
                      if (err) {
                        clear(imgrs);
                        console.log("\n ===> Stat error: ", err);
                        return;
                      }
                      console.log("\n===> Stat result: ", data);

                      imgrs.remove(key, function(err, data) {
                          if (err) {
                            clear(imgrs);
                            console.log("\n ===> Delete error: ", err);
                            return;
                          }

                          clear(imgrs);
                          console.log("\n===> Delete result: ", data);
                      });
                  });
              });
          });
      });
  });
});

function clear(imgrs){
  imgrs.drop(function(err, data){
    if (err) {
      console.log("\n ===> Drop bucket error: ", err);
      return;
    }
    console.log("\n===> Drop result: ", data);
  });
}
