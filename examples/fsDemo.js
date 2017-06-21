var qiniu = require('../');

// api reference https://developer.qiniu.com/fusion

qiniu.conf.ACCESS_KEY = 'ak';
qiniu.conf.SECRET_KEY = 'sk';

var cdnManager = new qiniu.fs.CdnManager;

var urls = "<url1>, <url2>";

var dirs = '<dir1>, <dir2>';

cdnManager.refreshUrls(urls, function (err, ret) {
    if (!err) {
        // 上传成功， 处理返回值
        console.log(ret);
    } else {
        // 上传失败， 处理返回代码
        console.log(err);
    }
});

cdnManager.refreshDirs(dirs, function (err, ret) {
    if (!err) {
        // 上传成功， 处理返回值
        console.log(ret);
    } else {
        // 上传失败， 处理返回代码
        console.log(err);
    }
});

cdnManager.refreshUrlsAndDirs(urls, dirs, function (err, ret) {
    if (!err) {
        // 上传成功， 处理返回值
        console.log(ret);
    } else {
        // 上传失败， 处理返回代码
        console.log(err);
    }
});

cdnManager.prefetch(urls, function (err, ret) {
    if (!err) {
        // 上传成功， 处理返回值
        console.log(ret);
    } else {
        // 上传失败， 处理返回代码
        console.log(err);
    }
});

var StartDate = "2017-03-01";
var EndDate = "2017-03-27";
var Granularity = "day";
var Domains = "domains";

cdnManager.bandwidth(StartDate, EndDate, Granularity, Domains, function (err, ret) {
    if (!err) {
        // 上传成功， 处理返回值
        console.log(ret);
    } else {
        // 上传失败， 处理返回代码
        console.log(err);
    }
});

cdnManager.flux(StartDate, EndDate, Granularity, Domains, function (err, ret) {
    if (!err) {
        // 上传成功， 处理返回值
        console.log(ret);
    } else {
        // 上传失败， 处理返回代码
        console.log(err);
    }
});

var Day = "2017-03-21"

cdnManager.logList(Day, Domains, function (err, ret) {
    if (!err) {
        // 上传成功， 处理返回值
        console.log(ret);
    } else {
        // 上传失败， 处理返回代码
        console.log(err);
    }
});