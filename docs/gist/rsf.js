var qiniu = require('../../');

// @gist listPrefix
qiniu.conf.ACCESS_KEY = '<Your Access Key>';
qiniu.conf.SECRET_KEY = '<Your Secret Key>';

qiniu.rsf.listPrefix(bucketname, prefix, marker, limit, function(ret) {
  if(ret.code === 200) {
    // process ret.data.marker & ret.data.items
  } else {
    // something error, see ret.code according to
    // http://docs.qiniu.com/api/file-handle.html#list
  }
});
// @endgist



