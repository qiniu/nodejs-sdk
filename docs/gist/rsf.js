var qiniu = require('../../');

// @gist listPrefix
qiniu.conf.ACCESS_KEY = '<Your Access Key>';
qiniu.conf.SECRET_KEY = '<Your Secret Key>';

qiniu.rsf.listPrefix(bucketname, prefix, marker, limit, function(err, ret) {
  if (!err) {
    // process ret.data.marker & ret.data.items
  } else {
    console.log(err)
    // http://docs.qiniu.com/api/file-handle.html#list
  }
});
// @endgist



