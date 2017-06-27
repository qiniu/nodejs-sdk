const qiniu = require("qiniu");
const proc = require("process");

//域名列表
var domains = [
  'if-pbl.qiniudn.com',
  'qdisk.qiniudn.com'
];

//指定日期
var logDay = '2017-06-20';
var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);

var cdnManager = new qiniu.cdn.CdnManager(mac);
//获取域名日志
cdnManager.getCdnLogList(domains, logDay, function(err, respBody, respInfo) {
  if (err) {
    throw err;
  }

  console.log(respInfo.statusCode);
  if (respInfo.statusCode == 200) {
    /**
      {
        "code":0,
        "error":"",
        "data":{
          "if-pbl.qiniudn.com":[
              {
              "name":"v2/if-pbl.qiniudn.com_2017-06-20-15_part-00000.gz",
              "size":220,
              "mtime":1497963801,
              "url":"http://fusionlog.qiniu.com/v2/xxxxx"
            }
          ]
        }
    }
    */
    var jsonBody = JSON.parse(respBody);
    var code = jsonBody.code;
    console.log(code);
    var logData = jsonBody.data;
    domains.forEach(function(domain) {
      console.log("log for domain: " + domain);
      var domainLogs = logData[domain];
      if (domainLogs != null) {
        domainLogs.forEach(function(logItem) {
          console.log(logItem.name);
          console.log(logItem.size);
          console.log(logItem.mtime);
          console.log(logItem.url);
        });
        console.log("------------------");
      }
    });
  }
});
