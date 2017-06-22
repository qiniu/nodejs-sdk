const qiniu = require("../index.js");
const proc = require("process");

//初始化ak,sk
qiniu.conf.ACCESS_KEY = proc.env.QINIU_ACCESS_KEY;
qiniu.conf.SECRET_KEY = proc.env.QINIU_SECRET_KEY;

var bucket = 'if-pbl';
var options = {};


qiniu.rsf.listPrefix(bucket, options, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    throw err;
  }

  if (respInfo.statusCode == 200) {
    //如果这个nextMarker不为空，那么还有未列举完毕的文件列表，下次调用listPrefix的时候，
    //指定options里面的marker为这个值
    var nextMarker = respBody.marker;
    var commonPrefixes = respBody.commonPrefixes;
    var items = respBody.items;
    items.forEach(function(item) {
      console.log(item.key);
      console.log(item.putTime);
      console.log(item.hash);
      console.log(item.fsize);
      console.log(item.mimeType);
      console.log(item.endUser);
      console.log(item.type);
    });
  }
});
