var fs = require('fs');
var path = require('path');
var mime = require('mime');
var qiniu = require('../index.js');

qiniu.conf.ACCESS_KEY = '<Please apply your access key>';
qiniu.conf.SECRET_KEY = '<Dont send your secret key to anyone>';

var key = __filename;
var friendName = key;
var bucket = 'qiniutest';
var DEMO_DOMAIN = bucket + '.qiniudn.com';

var conn = new qiniu.digestauth.Client();

qiniu.rs.mkbucket(conn, bucket, function(err, data) {
  if (err) {
    console.log("\n ===> Make bucket error: ", err);
    clear(rs);
    return;
  }

  console.log("\n===> Make bucket result: ", data);

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

  var rs = new qiniu.rs.Service(conn, bucket);

  var localFile = key,
      customMeta = "",
      callbackParams = {},
      enableCrc32Check = true;

  rs.uploadFileWithToken(uploadToken, localFile, key, mimeType, customMeta, callbackParams, enableCrc32Check, function(err, data){
    if (err) {
      console.log("\n ===> Upload file with token error: ", err);
      clear(rs);
      return;
    }

    console.log("\n===> Upload File with Token result: ", data);

    rs.publish(DEMO_DOMAIN, function(err, data){
      if (err) {
        console.log("\n ===> Make bucket error: ", err);
        clear(rs);
        return;
      }

      console.log("\n===> Publish result: ", data);

      rs.stat(key, function(err, data) {
          if (err) {
            console.log("\n ===> Make bucket error: ", err);
            clear(rs);
            return;
          }

          console.log("\n===> Stat result: ", data);

          rs.get(key, friendName, function(err, data) {
              if (err) {
                console.log("\n ===> Make bucket error: ", err);
                clear(rs);
                return;
              }

              console.log("\n===> Get result: ", data);

              rs.remove(key, function(err, data) {
                if (err) {
                  console.log("\n ===> Make bucket error: ", err);
                  clear(rs);
                  return;
                }
                clear(rs);
                console.log("\n===> Delete result: ", data);
              });
          });
      });
    });
  });
});

function clear(rs) {
  rs.drop(function(err, data){
    if (err) {
      console.log("Drop bucket error: ", err);
      return;
    }
    console.log("\n===> Drop result: ", data);
  });
}
