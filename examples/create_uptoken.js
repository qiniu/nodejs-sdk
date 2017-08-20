const qiniu = require("qiniu");
const proc = require("process");

var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);

var bucket = proc.env.QINIU_TEST_BUCKET;

//简单上传凭证
var options = {
  scope: bucket,
};
var putPolicy = new qiniu.rs.PutPolicy(options);
console.log(putPolicy.uploadToken(mac));

//自定义凭证有效期（示例2小时）
var options = {
  scope: bucket,
  expires: 7200
}
var putPolicy = new qiniu.rs.PutPolicy(options);
console.log(putPolicy.uploadToken(mac));

// 覆盖上传凭证
var keyToOverwrite = 'qiniu.mp4';
var options = {
  scope: bucket + ":" + keyToOverwrite
}
var putPolicy = new qiniu.rs.PutPolicy(options);
console.log(putPolicy.uploadToken(mac));

//自定义上传回复（非callback模式）凭证
var options = {
  scope: bucket,
  returnBody: '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize),"bucket":"$(bucket)","name":"$(x:name)"}'
}
var putPolicy = new qiniu.rs.PutPolicy(options);
console.log(putPolicy.uploadToken(mac));

//带回调业务服务器的凭证（application/json）
var options = {
  scope: bucket,
  callbackUrl: 'http://api.example.com/qiniu/upload/callback',
  callbackBody: '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize),"bucket":"$(bucket)","name":"$(x:name)"}',
  callbackBodyType: 'application/json'
}
var putPolicy = new qiniu.rs.PutPolicy(options);
console.log(putPolicy.uploadToken(mac));


//带回调业务服务器的凭证（application/x-www-form-urlencoded）
var options = {
  scope: bucket,
  callbackUrl: 'http://api.example.com/qiniu/upload/callback',
  callbackBody: 'key=$(key)&hash=$(etag)&bucket=$(bucket)&fsize=$(fsize)&name=$(x:name)'
}
var putPolicy = new qiniu.rs.PutPolicy(options);
console.log(putPolicy.uploadToken(mac));

//带数据处理的凭证
var saveMp4Entry = qiniu.util.urlsafeBase64Encode(bucket +
  ":avthumb_test_target.mp4");
var saveJpgEntry = qiniu.util.urlsafeBase64Encode(bucket +
  ":vframe_test_target.jpg");
var avthumbMp4Fop = "avthumb/mp4|saveas/" + saveMp4Entry;
var vframeJpgFop = "vframe/jpg/offset/1|saveas/" + saveJpgEntry;
var options = {
  scope: bucket,
  persistentOps: avthumbMp4Fop + ";" + vframeJpgFop,
  persistentPipeline: "video-pipe",
  persistentNotifyUrl: "http://api.example.com/qiniu/pfop/notify",
}
var putPolicy = new qiniu.rs.PutPolicy(options);
console.log(putPolicy.uploadToken(mac));
