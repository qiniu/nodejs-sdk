const qiniu = require("../index.js");
const proc = require("process");

//初始化ak,sk
qiniu.conf.ACCESS_KEY = proc.env.QINIU_ACCESS_KEY;
qiniu.conf.SECRET_KEY = proc.env.QINIU_SECRET_KEY;

//域名列表
var domains = [
  'if-pbl.qiniudn.com',
  'qdisk.qiniudn.com'
];

//指定日期
var startDate = '2017-06-20';
var endDate = '2017-06-22';
var granularity = 'day';

//获取域名流量
qiniu.cdn.getFluxData(startDate, endDate, granularity, domains, function(err,
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
