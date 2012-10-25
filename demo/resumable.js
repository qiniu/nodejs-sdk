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
  var result = resumable.upload(__filename, function(resp){
    rs.get(key, friendName, function(resp) {
      console.log("\n===> Get result: ", resp);
      if (resp.code != 200) {
          clear(rs);
          return;
      }

      rs.remove(key, function(resp) {
          clear(rs);
          console.log("\n===> Delete result: ", resp);
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

