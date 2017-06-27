const qiniu = require("qiniu");
const proc = require("process");
const tunnel = require('tunnel-agent');

var bucket = 'if-pbl';
var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var options = {
  scope: bucket,
}
var putPolicy = new qiniu.rs.PutPolicy(options);

var uploadToken = putPolicy.uploadToken(mac);
var config = new qiniu.conf.Config();
//config.zone = qiniu.zone.Zone_z0;
//config.useHttpsDomain = true;
var formUploader = new qiniu.form_up.FormUploader(config);
var putExtra = new qiniu.form_up.PutExtra();

//设置HTTP(s)代理服务器，这里可以参考：https://github.com/request/tunnel-agent
//有几个方法:
//exports.httpOverHttp = httpOverHttp
//exports.httpsOverHttp = httpsOverHttp
//exports.httpOverHttps = httpOverHttps
//exports.httpsOverHttps = httpsOverHttps

var proxyAgent = tunnel.httpOverHttp({
  proxy: {
    host: 'localhost',
    port: 8888
  }
});

qiniu.conf.RPC_HTTP_AGENT = proxyAgent;

//qiniu.conf.RPC_HTTPS_AGENT = proxyAgent;
//以代理方式上传
formUploader.put(uploadToken, null, "hello", null, function(respErr,
  respBody, respInfo) {
  if (respErr) {
    throw respErr;
  }

  if (respInfo.statusCode == 200) {
    console.log(respBody);
  } else {
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
