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
    var body = {
        'urls' : urls
    }
    var uri = conf.FS_HOST + '/v2/tune/refresh';
    var digest = util.generateAccessToken(uri, querystring.stringify(body));
    console.log("token", digest);

    rpc.postWithForm(uri, querystring.stringify(body), digest, onret);
}

CdnManager.prototype.refreshDirs = function (urls, onret) {
    var body = {
        'dirs' : urls
    }
    var uri = conf.FS_HOST + '/v2/tune/refresh';
    var digest = util.generateAccessToken(uri, querystring.stringify(body));
    console.log("token", digest);

    rpc.postWithForm(uri, querystring.stringify(body), digest, onret);
}

CdnManager.prototype.refreshUrlsAndDirs = function (urls, dirs, onret) {
    var body = {
        'urls' : undefined,
        'dirs' : dirs
    };

    var uri = conf.FS_HOST + '/v2/tune/refresh';
    var digest = util.generateAccessToken(uri, querystring.stringify(body));
    console.log("token", digest);

    rpc.postWithForm(uri, querystring.stringify(body), digest, onret);
}
