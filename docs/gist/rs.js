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
    // ret.data has keys (hash, fsize, putTime, mimeType)
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

// @gist batchStat
var path0 = new qiniu.rs.EntryPath(bucketName, key0);
var path1 = new qiniu.rs.EntryPath(bucketName, key1);
var path2 = new qiniu.rs.EntryPath(bucketName, key2);
var client = new qiniu.rs.Client();
client.batchStat([path0, path1, path2], function(ret) {
  if (ret.code === 200) {
    // ok, parse ret.data
    // each item in ret.data has keys (code, data)
    // ret.data[i].data has keys (hash, fsize, putTime, mimeType)
  } else {
    // something error, process ret.code
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
});
// @endgist

// @gist batchCopy
var pathSrc0 = new qiniu.rs.EntryPath(bucketName, key0);
var pathDest0 = new qiniu.rs.EntryPath(bucketName, key1);
var pathSrc1 = new qiniu.rs.EntryPath(bucketName, key2);
var pathDest1 = new qiniu.rs.EntryPath(bucketName, key3);
var pair0 = new qiniu.rs.EntryPathPair(pathSrc0, pathDest0);
var pair1 = new qiniu.rs.EntryPathPair(pathSrc1, pathDest1);
var client = new qiniu.rs.Client();

client.batchCopy([pair0, pair1], function(ret) {
  if (ret.code === 200) {
    // ok
  } else {
    // something error, process ret.code
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
});
// @endgist


// @gist batchMove
var pathSrc0 = new qiniu.rs.EntryPath(bucketName, key0);
var pathDest0 = new qiniu.rs.EntryPath(bucketName, key1);
var pathSrc1 = new qiniu.rs.EntryPath(bucketName, key2);
var pathDest1 = new qiniu.rs.EntryPath(bucketName, key3);
var pair0 = new qiniu.rs.EntryPathPair(pathSrc0, pathDest0);
var pair1 = new qiniu.rs.EntryPathPair(pathSrc1, pathDest1);
var client = new qiniu.rs.Client();

client.batchMove([pair0, pair1], function(ret) {
  if (ret.code === 200) {
    // ok
  } else {
    // something error, process ret.code
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
});
// @endgist

// @gist batchDelete
var path0 = new qiniu.rs.EntryPath(bucketName, key0);
var path1 = new qiniu.rs.EntryPath(bucketName, key1);
var path2 = new qiniu.rs.EntryPath(bucketName, key2);
var client = new qiniu.rs.Client();

client.batchDelete([path0, path1, path2], function(ret) {
  if (ret.code === 200) {
    // ok
  } else {
    // something error, process ret.code
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
});
// @endgist
