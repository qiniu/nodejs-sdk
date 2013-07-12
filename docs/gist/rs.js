var qiniu = require('../../');

// @gist init
qiniu.conf.ACCESS_KEY = '<Your Access Key>';
qiniu.conf.SECRET_KEY = '<Your Secret Key>';
// @endgist


// @gist stat
var client = new qiniu.rs.Client();
client.stat(bucketName, key, function(ret) {
  if (ret.code === 200) {
    // process 
    // ret.data.hash & ret.data.fsize & ret.data.putTime & ret.data.mimeType
  } else {
    // something error, process ret.code 
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
});
// @endgist

// @gist move
var client = new qiniu.rs.Client();
client.move(bucketSrc, keySrc, bucketDestm keyDest, function(ret) {
  if (ret.code === 200) {
    // ok
  } else {
    // something error, process ret.code
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
});
// @endgist

// @gist copy
var client = new qiniu.rs.Client();
client.copy(bucketSrc, keySrc, bucketDestm keyDest, function(ret) {
  if (ret.code === 200) {
    // ok
  } else {
    // something error, process ret.code
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
});
// @endgist

// @gist remove
var client = new qiniu.rs.Client();
client.remove(bucketName, key, function(ret) {
  if (ret.code === 200) {
    // ok
  } else {
    // something error, process ret.code
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
})
// @endgist


