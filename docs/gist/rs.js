var qiniu = require('../../');

// @gist init
qiniu.conf.ACCESS_KEY = '<Your Access Key>';
qiniu.conf.SECRET_KEY = '<Your Secret Key>';
// @endgist


// @gist stat
var client = new qiniu.rs.Client();
client.stat(bucketName, key, function(err, ret) {
  if (!err) {
    // ok 
    // ret has keys (hash, fsize, putTime, mimeType)
  } else {
    console.log(err);
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
});
// @endgist

// @gist move
var client = new qiniu.rs.Client();
client.move(bucketSrc, keySrc, bucketDest, keyDest, function(err, ret) {
  if (!err) {
    // ok
  } else {
    console.log(err);
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
});
// @endgist

// @gist copy
var client = new qiniu.rs.Client();
client.copy(bucketSrc, keySrc, bucketDest, keyDest, function(err, ret) {
  if (!err) {
    // ok
  } else {
    console.log(err);
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
});
// @endgist

// @gist remove
var client = new qiniu.rs.Client();
client.remove(bucketName, key, function(err, ret) {
  if (!err) {
    // ok
  } else {
    console.log(err);
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
})
// @endgist

// @gist batchStat
var path0 = new qiniu.rs.EntryPath(bucketName, key0);
var path1 = new qiniu.rs.EntryPath(bucketName, key1);
var path2 = new qiniu.rs.EntryPath(bucketName, key2);
var client = new qiniu.rs.Client();

client.batchStat([path0, path1, path2], function(err, ret) {
  if (!err) {
    for (i in ret) {
      if (ret[i].code === 200) {
        //ok, ret[i].data has keys (hash, fsize, putTime, mimeType)
      } else {
        // parse error code
        console.log(ret[i].code, ret[i].data);
        // http://docs.qiniu.com/api/file-handle.html#error-code
      }
    }
  } else {
    console.log(err);
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

client.batchCopy([pair0, pair1], function(err, ret) {
  if (!err) {
    for (i in ret) {
      if (ret[i].code !== 200) {
        // parse error code
        console.log(ret[i].code, ret[i].data);
        // http://docs.qiniu.com/api/file-handle.html#error-code
      }
    }

  } else {
    console.log(err);
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

client.batchMove([pair0, pair1], function(err, ret) {
  if (!err) {
    for (i in ret) {
      if (ret[i] !== 200) {
        // parse error code
        console.log(ret[i].code, ret[i].data);
        // http://docs.qiniu.com/api/file-handle.html#error-code
      }
    }
  } else {
    console.log(err);
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
});
// @endgist

// @gist batchDelete
var path0 = new qiniu.rs.EntryPath(bucketName, key0);
var path1 = new qiniu.rs.EntryPath(bucketName, key1);
var path2 = new qiniu.rs.EntryPath(bucketName, key2);

var client = new qiniu.rs.Client();

client.batchDelete([path0, path1, path2], function(err, ret) {
  if (!err) {
    for (i in ret) {
      if (ret[i].code !== 200) {
        // parse error code
        console.log(ret[i].code, ret[i].data);
        // http://docs.qiniu.com/api/file-handle.html#error-code
      }
    }
  } else {
    console.log(err);
    // http://docs.qiniu.com/api/file-handle.html#error-code
  }
});
// @endgist
