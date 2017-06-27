const qiniu = require("qiniu");
const proc = require("process");

var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var config = new qiniu.conf.Config();
//config.useHttpsDomain = true;
config.zone = qiniu.zone.Zone_z1;
var operManager = new qiniu.fop.OperationManager(mac, config);

//处理指令集合
var saveBucket = 'if-bc';
var fops = [
  'avthumb/mp4/s/480x320/vb/150k|saveas/' + qiniu.util.urlsafeBase64Encode(
    saveBucket + ":qiniu_480x320.mp4"),
  'vframe/jpg/offset/10|saveas/' + qiniu.util.urlsafeBase64Encode(saveBucket +
    ":qiniu_frame1.jpg")
];
var pipeline = 'jemy';
var srcBucket = 'if-bc';
var srcKey = 'qiniu.mp4';

var options = {
  'notifyURL': 'http://api.example.com/pfop/callback',
  'force': false,
};

//持久化数据处理返回的是任务的persistentId，可以根据这个id查询处理状态
operManager.pfop(srcBucket, srcKey, fops, pipeline, options, function(err,
  respBody,
  respInfo) {
  if (err) {
    throw err;
  }

  if (respInfo.statusCode == 200) {
    console.log(respBody.persistentId);
  } else {
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
