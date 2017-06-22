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

//获取域名带宽
qiniu.cdn.getBandwidthData(startDate, endDate, granularity, domains, function(
  err, respBody, respInfo) {
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

    var bandwidthData = jsonBody.data;
    domains.forEach(function(domain) {
      var bandwidthDataOfDomain = bandwidthData[domain];
      if (bandwidthDataOfDomain != null) {
        console.log("bandwidth data for:" + domain);
        var bandwidthChina = bandwidthDataOfDomain["china"];
        var bandwidthOversea = bandwidthDataOfDomain["oversea"];
        console.log(bandwidthChina);
        console.log(bandwidthOversea);
      } else {
        console.log("no bandwidth data for:" + domain);
      }
      console.log("----------");
    });
  }
});
