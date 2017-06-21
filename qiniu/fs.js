/**
 * Created by guhao on 2017/3/23.
 */
var conf = require('./conf');
var rpc = require('./rpc');
var util = require('./util');
var querystring = require('querystring');

exports.CdnManager = CdnManager;

function CdnManager(cdnManager) {
    this.cdnManager = cdnManager || null;
}

CdnManager.prototype.refreshUrls = function (urls, onret) {
    var _urls = urls.split(",");
    var body = {
        'urls' : _urls
    }
    var uri = conf.FS_HOST + '/v2/tune/refresh';
    var digest = util.generateAccessToken(uri, querystring.stringify(body));
    console.log('token' + digest);
    rpc.postWithForm(uri, querystring.stringify(body), digest, onret);
}

CdnManager.prototype.refreshDirs = function (dirs, onret) {
    var _dirs = dirs.split(",");
    var body = {
        'dirs' : _dirs
    }
    var uri = conf.FS_HOST + '/v2/tune/refresh';
    var digest = util.generateAccessToken(uri, querystring.stringify(body));
    rpc.postWithForm(uri, querystring.stringify(body), digest, onret);
}

CdnManager.prototype.refreshUrlsAndDirs = function (urls, dirs, onret) {
    var _urls = urls.split(",");
    var _dirs = dirs.split(",");
    var body = {
        'urls' : _urls,
        'dirs' : _dirs
    };
    var uri = conf.FS_HOST + '/v2/tune/refresh';
    var digest = util.generateAccessToken(uri, querystring.stringify(body));
    rpc.postWithForm(uri, querystring.stringify(body), digest, onret);
}

CdnManager.prototype.prefetch = function (urls, onret) {
    var _urls = urls.split(",");
    var body = {
        'urls' : _urls
    }
    var uri = conf.FS_HOST + '/v2/tune/prefetch';
    var digest = util.generateAccessToken(uri, querystring.stringify(body));
    rpc.postWithForm(uri, querystring.stringify(body), digest, onret);
}

CdnManager.prototype.bandwidth = function (StartDate, EndDate, Granularity, Domains, onret) {
    var body = {
        'startDate' : StartDate,
        'endDate' : EndDate,
        'granularity' : Granularity,
        'domains' : Domains
    }
    var uri = conf.FS_HOST + '/v2/tune/bandwidth';
    var digest = util.generateAccessToken(uri, querystring.stringify(body));
    rpc.postWithForm(uri, querystring.stringify(body), digest, onret);
}

CdnManager.prototype.flux = function (StartDate, EndDate, Granularity, Domains, onret) {
    var body = {
        'startDate' : StartDate,
        'endDate' : EndDate,
        'granularity' : Granularity,
        'domains' : Domains
    }
    var uri = conf.FS_HOST + '/v2/tune/flux';
    var digest = util.generateAccessToken(uri, querystring.stringify(body));
    rpc.postWithForm(uri, querystring.stringify(body), digest, onret);
}

CdnManager.prototype.logList = function (Day, Domains, onret) {
    var body = {
        'day' : Day,
        'domains' : Domains
    }
    var uri = conf.FS_HOST + '/v2/tune/log/list';
    var digest = util.generateAccessToken(uri, querystring.stringify(body));
    rpc.postWithForm(uri, querystring.stringify(body), digest, onret);
}


