var qiniu = require('../../');

// @gist uploadFile
function uploadFile(localFile, key, uptoken) {
  var extra = new qiniu.io.PutExtra();
  //extra.params = params;
  //extra.mimeType = mimeType;
  //extra.crc32 = crc32;
  //extra.checkCrc = checkCrc;

  io.putFile(uptoken, key, localFile, extra, function(ret) {
    if(ret.code === 200) {
      // 上传成功， 处理返回值
      // ret.data.key & ret.data.hash
    } else {
      // 上传失败， 处理返回代码
      // ret.code
      // http://docs.qiniu.com/api/put.html#error-code
    }
  });
}
// @endgist

// @gist uploadBuf
function uploadBuf(body, key, uptoken) {
  var extra = new qiniu.io.PutExtra();
  //extra.params = params;
  //extra.mimeType = mimeType;
  //extra.crc32 = crc32;
  //extra.checkCrc = checkCrc;

  io.put(uptoken, key, body, extra, function(ret) {
    if(ret.code === 200) {
      // 上传成功， 处理返回值
      // ret.data.key & ret.data.hash
    } else {
      // 上传失败， 处理返回代码
      // ret.code
      // http://docs.qiniu.com/api/put.html#error-code
    }
  });
}
// @endgist
