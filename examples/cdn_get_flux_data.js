const qiniu = require("qiniu");
const proc = require("process");

//域名列表
var domains = [
  'if-pbl.qiniudn.com',
  'qdisk.qiniudn.com'
];

//指定日期
var startDate = '2017-06-20';
var endDate = '2017-06-22';
var granularity = 'day';
var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);

var cdnManager = new qiniu.cdn.CdnManager(mac);
//获取域名流量
cdnManager.getFluxData(startDate, endDate, granularity, domains, function(err,
  respBody, respInfo) {
  if (err) {
    throw err;
  }

  console.log(respInfo.statusCode);
  if (respInfo.statusCode == 200) {
    var jsonBody = JSON.parse(respBody);
    var code = jsonBody.code;
    console.log(code);

    var tickTime = jsonBody.time;
    console.log(tickTime);

    var fluxData = jsonBody.data;
    domains.forEach(function(domain) {
      var fluxDataOfDomain = fluxData[domain];
      if (fluxDataOfDomain != null) {
        console.log("flux data for:" + domain);
        var fluxChina = fluxDataOfDomain["china"];
        var fluxOversea = fluxDataOfDomain["oversea"];
        console.log(fluxChina);
        console.log(fluxOversea);
      } else {
        console.log("no flux data for:" + domain);
      }
      console.log("----------");
    });
  }
});
