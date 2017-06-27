const url = require('url');
const crypto = require('crypto');
const urllib = require('urllib');
const util = require('./util');
const digest = require('./auth/digest.js');
const urlencode = require('urlencode');

exports.CdnManager = CdnManager;

function CdnManager(mac) {
  this.mac = mac || new digest.Mac();
}

// 获取域名日志下载链接
// @link http://developer.qiniu.com/article/fusion/api/log.html
//
// @param domains 域名列表 domains = ['obbid7qc6.qnssl.com','7xkh68.com1.z0.glb.clouddn.com']
// @param logDay  日期，例如 2016-07-01
// @param callbackFunc(err, respBody, respInfo)
CdnManager.prototype.getCdnLogList = function(domains, logDay, callbackFunc) {
  var url = '/v2/tune/log/list\n';
  var accessToken = util.generateAccessToken(this.mac, url, '');
  var headers = {
    'Content-Type': 'application/json',
    'Authorization': accessToken,
  };
  postBody = {
    'day': logDay,
    'domains': domains.join(';')
  }

  req('/v2/tune/log/list', headers, postBody, callbackFunc);
}


// 获取域名访问流量数据
// @link http://developer.qiniu.com/article/fusion/api/traffic-bandwidth.html#batch-flux
//
// @param startDate   开始日期，例如：2016-07-01
// @param endDate     结束日期，例如：2016-07-03
// @param granularity 粒度，取值：5min／hour／day
// @param domains     域名列表 domain = ['obbid7qc6.qnssl.com','obbid7qc6.qnssl.com'];
// @param callbackFunc(err, respBody, respInfo)
CdnManager.prototype.getFluxData = function(startDate, endDate, granularity,
  domains,
  callbackFunc) {
  var url = '/v2/tune/flux\n';
  var accessToken = util.generateAccessToken(this.mac, url, '');
  var headers = {
    'Content-Type': 'application/json',
    'Authorization': accessToken,
  };
  data = {
    'startDate': startDate,
    'endDate': endDate,
    'granularity': granularity,
    'domains': domains.join(';')
  }

  req('/v2/tune/flux', headers, data, callbackFunc);
}


// 获取域名访问带宽数据
// @link http://developer.qiniu.com/article/fusion/api/traffic-bandwidth.html
// @param startDate 开始日期，例如：2016-07-01
// @param endDate   结束日期，例如：2016-07-03
// @param granularity 粒度，取值：5min／hour／day
// @param domains   域名列表 domain = ['obbid7qc6.qnssl.com','obbid7qc6.qnssl.com']
// @param callbackFunc(err, respBody, respInfo)
CdnManager.prototype.getBandwidthData = function(startDate, endDate,
  granularity, domains,
  callbackFunc) {
  var url = '/v2/tune/bandwidth\n';
  var accessToken = util.generateAccessToken(this.mac, url, '');
  var headers = {
    'Content-Type': 'application/json',
    'Authorization': accessToken,
  };
  data = {
    'startDate': startDate,
    'endDate': endDate,
    'granularity': granularity,
    'domains': domains.join(';')
  }

  req('/v2/tune/bandwidth', headers, data, callbackFunc);
}


// 预取文件链接
// @link http://developer.qiniu.com/article/fusion/api/prefetch.html
//
// @param 预取urls  urls = ['http://obbid7qc6.qnssl.com/023','http://obbid7qc6.qnssl.com/025']
// @param callbackFunc(err, respBody, respInfo)
CdnManager.prototype.prefetchUrls = function(urls, callbackFunc) {
  var postBody = {
    urls: urls
  };
  var url = '/v2/tune/prefetch\n';
  var accessToken = util.generateAccessToken(this.mac, url, '');
  var headers = {
    'Content-Type': 'application/json',
    'Authorization': accessToken,
  };

  req('/v2/tune/prefetch', headers, postBody, callbackFunc);
}


// 刷新链接
// @link http://developer.qiniu.com/article/fusion/api/refresh.html
// 刷新urls  refreshUrls =  ['http://obbid7qc6.qnssl.com/023','http://obbid7qc6.qnssl.com/025']
CdnManager.prototype.refreshUrls = function(urls, callbackFunc) {
  this.refreshUrlsAndDirs(urls, null, callbackFunc);
}


// 刷新目录
// 刷新目录列表，每次最多不可以超过10个目录, 刷新目录需要额外开通权限，可以联系七牛技术支持处理
// @link http://developer.qiniu.com/article/fusion/api/refresh.html
// 刷新dirs  refreshDirs =  ['http://obbid7qc6.qnssl.com/wo/','http://obbid7qc6.qnssl.com/']
CdnManager.prototype.refreshDirs = function(dirs, callbackFunc) {
  this.refreshUrlsAndDirs(null, dirs, callbackFunc);
}


CdnManager.prototype.refreshUrlsAndDirs = function(urls, dirs, callbackFunc) {
  var postBody = {
    urls: urls,
    dirs: dirs,
  };
  var url = '/v2/tune/refresh\n';
  var accessToken = util.generateAccessToken(this.mac, url, '');
  var headers = {
    'Content-Type': 'application/json',
    'Authorization': accessToken,
  };

  req('/v2/tune/refresh', headers, postBody, callbackFunc);
}


// post 请求
function req(reqPath, header, reqBody, callbackFunc) {
  urllib.request("http://fusion.qiniuapi.com" + reqPath, {
    method: 'POST',
    headers: header,
    data: reqBody,
  }, callbackFunc);
}

// 构建标准的基于时间戳的防盗链
// @param  domain     自定义域名，例如 http://img.abc.com
// @param  fileName   待访问的原始文件名，必须是utf8编码，不需要进行urlencode
// @param  query      业务自身的查询参数，必须是utf8编码，不需要进行urlencode,
//                    例如 {aa:"23", attname:"11111111111111"}
// @param  encryptKey 时间戳防盗链的签名密钥，从七牛后台获取
// @param  deadline   链接的有效期时间戳，是以秒为单位的Unix时间戳
// @return signedUrl  最终的带时间戳防盗链的url
CdnManager.prototype.createTimestampAntiLeechUrl = function(domain, fileName,
  query, encryptKey, deadline) {
  if (query != null) {
    var arr = [];
    Object.getOwnPropertyNames(query).forEach(function(val, idx, array) {
      arr.push(val + "=" + urlencode(query[val]));
    });
    urlToSign = domain + '/' + urlencode(fileName) + '?' + arr.join('&');
  } else {
    urlToSign = domain + '/' + urlencode(fileName);
  }

  var urlObj = url.parse(urlToSign);
  pathname = urlObj.pathname;

  var expireHex = deadline.toString(16);
  var signedStr = encryptKey + pathname + expireHex;

  var md5 = crypto.createHash('md5');
  var toSignStr = md5.update(signedStr).digest('hex');

  if (query != null) {
    return urlToSign + '&sign=' + toSignStr + '&t=' + expireHex;
  } else {
    return urlToSign + '?sign=' + toSignStr + '&t=' + expireHex;
  }
}
