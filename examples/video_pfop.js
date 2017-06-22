const qiniu = require("../index.js");
const proc = require("process");

//初始化ak,sk
qiniu.conf.ACCESS_KEY = proc.env.QINIU_ACCESS_KEY;
qiniu.conf.SECRET_KEY = proc.env.QINIU_SECRET_KEY;

//处理指令集合
var saveBucket = 'if-pbl';
var fops = [
  'avthumb/mp4/s/480x320/vb/150k|saveas/' + qiniu.util.urlsafeBase64Encode(
    saveBucket + ":qiniu_480x320.mp4"),
  'vframe/jpg/offset/10|saveas/' + qiniu.util.urlsafeBase64Encode(saveBucket +
    ":qiniu_frame1.jpg")
];
var pipeline = 'jemy';
var srcBucket = 'if-pbl';
var srcKey = 'qiniu.mp4';

var options = {
  'notifyURL': 'http://api.example.com/pfop/callback',
  'force': false,
};

//持久化数据处理返回的是任务的persistentId，可以根据这个id查询处理状态
qiniu.fop.pfop(srcBucket, srcKey, fops, pipeline, options, function(err,
  respBody,
  respInfo) {
  if (err) {
    console.log(err);
    throw err;
  }

  if (respInfo.statusCode == 200) {
    console.log(respBody.persistentId);
  }
});
