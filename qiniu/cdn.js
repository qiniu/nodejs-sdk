var url = require('url');
var crypto = require('crypto');
var urllib = require('urllib');
var util = require('./util');
var request = require('request');

// 获取域名日志下载链接
// @link http://developer.qiniu.com/article/fusion/api/log.html
// domains 域名列表 domains = ['obbid7qc6.qnssl.com','7xkh68.com1.z0.glb.clouddn.com']
exports.getCdnLogList = function (domains, logDate){
    var url = '/v2/tune/log/list\n';
    var accessToken = util.generateAccessToken(url, '');
    var headers = {
        'Content-Type': 'application/json',
        'Authorization': accessToken,
    };
    data = {
        'day': logDate,
        'domains': domains.join(';')
    }

    req('/v2/tune/log/list', headers, data); 
}


// 获取域名访问流量数据
// @link http://developer.qiniu.com/article/fusion/api/traffic-bandwidth.html#batch-flux
exports.getFluxData = function(startDate, endDate, granularity, domain){
    var url = '/v2/tune/flux\n';
    var accessToken = util.generateAccessToken(url, '');
    var headers = {
        'Content-Type': 'application/json',
        'Authorization': accessToken,
    };
    data = {
        'startDate': startDate,
        'endDate': endDate,
        'granularity': granularity,
        'domains': domain
    }

    req('/v2/tune/flux', headers, data); 
}


// 获取域名访问带宽数据
// @link http://developer.qiniu.com/article/fusion/api/traffic-bandwidth.html
exports.getBandwidthData = function(startDate, endDate, granularity, domain){
    var url = '/v2/tune/bandwidth\n';
    var accessToken = util.generateAccessToken(url, '');
    var headers = {
        'Content-Type': 'application/json',
        'Authorization': accessToken,
    };
    data = {
        'startDate': startDate,
        'endDate': endDate,
        'granularity': granularity,
        'domains': domain
    }

    req('/v2/tune/bandwidth', headers, data); 
}


// 预取文件链接
// @link http://developer.qiniu.com/article/fusion/api/prefetch.html
// 预取urls  prefetchUrls = ['http://obbid7qc6.qnssl.com/023','http://obbid7qc6.qnssl.com/025']
exports.prefetchUrls = function(prefetchUrls){
    var postBody = {urls:prefetchUrls};
    var url = '/v2/tune/prefetch\n';
    var accessToken = util.generateAccessToken(url, '');
    var headers = {
        'Content-Type': 'application/json',
        'Authorization': accessToken,
    };
    
    req('/v2/tune/prefetch', headers, postBody);
}


// 刷新链接
// @link http://developer.qiniu.com/article/fusion/api/refresh.html
// 刷新urls  refreshUrls =  ['http://obbid7qc6.qnssl.com/023','http://obbid7qc6.qnssl.com/025']
exports.refreshUrls = function(urls){
    var postBody = {urls:urls};
    var url = '/v2/tune/refresh\n';
    var accessToken = util.generateAccessToken(url, '');
    var headers = {
        'Content-Type': 'application/json',
        'Authorization': accessToken,
    };

    req('/v2/tune/refresh', headers, postBody);
}


// 刷新目录
// @link http://developer.qiniu.com/article/fusion/api/refresh.html
// 刷新dirs  refreshDirs =  ['http://obbid7qc6.qnssl.com/wo/','http://obbid7qc6.qnssl.com/']
exports.refreshDirs = function(dirs){
    var postBody = {dirs:dirs};
    var url = '/v2/tune/refresh\n';
    var accessToken = util.generateAccessToken(url, '');
    var headers = {
        'Content-Type': 'application/json',
        'Authorization': accessToken,
    };

    req('/v2/tune/refresh', headers, postBody);
}


// post 请求
function req(pathname, header, datas){
    urllib.request("http://fusion.qiniuapi.com" + pathname, {
    method: 'POST',
    headers: header,
    data:datas
},function (err, data, res) {
    if (err) {
       throw err; // you need to handle error 
    }
        console.log(res.statusCode);
        console.log(data.toString())
 });
}


// 构建标准的基于时间戳的防盗链
// url 链接 格式为：http://user:pass@host.com:8080/2?v=xx
// encryptKey 时间戳秘钥
// durationInSeconds 设置有效期，单位秒
// return 最终的带时间戳防盗链的url
exports.createTimestampAntiLeechUrl = function(urlString, encryptKey, durationInSeconds){
    // 获取pathname
    var urlStr = url.parse(urlString);
    var pathname = urlStr.pathname;


    //获取linux时间戳（当前时间+有效时间）的16进制
    var dateNow = parseInt(Date.now()/1000);
    var timestampNow =  dateNow + durationInSeconds;


    var expireHex = timestampNow.toString(16);
    var signedStr = encryptKey + pathname + expireHex;


    var md5 = crypto.createHash('md5');
    var toSignStr = md5.update(signedStr).digest('hex');

    //判断查询参数
    if(urlStr.search){
        return urlString + '&sign=' + toSignStr + '&t=' + expireHex;
    }else{
        return urlString + '?sign=' + toSignStr + '&t=' + expireHex;
    }
}

