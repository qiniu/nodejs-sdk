const fs = require('fs');
const path = require('path');
const os = require('os');

exports.ACCESS_KEY = '<PLEASE APPLY YOUR ACCESS KEY>';
exports.SECRET_KEY = '<DONT SEND YOUR SECRET KEY TO ANYONE>';

var pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../', 'package.json')));
var defaultUserAgent = function() {
  return 'QiniuNodejs/' + pkg.version + ' (' + os.type() + '; ' + os.platform() +
    '; ' + os.arch() + '; )';
}

exports.USER_AGENT = defaultUserAgent();
const BLOCK_SIZE = 4 * 1024 * 1024; //4MB, never change

//define api form mime type
exports.FormMimeUrl = "application/x-www-form-urlencoded";
exports.FormMimeJson = "application/json";
exports.FormMimeRaw = "application/octet-stream";
exports.RS_HOST = "http://rs.qiniu.com";
exports.RPC_TIMEOUT = 30000; //30s

exports.Config = function Config(options) {
  options = options || {};
  //connect timeout, in seconds
  this.connectTimeout = options.connectTimeout || 30;
  //response timeout, in seconds
  this.responseTimeout = options.responseTimeout || 30;
  //put threshold, in bytes
  this.putThreshold = options.putThreshold || BLOCK_SIZE;
  //use http or https protocol
  this.useHttpsDomain = options.useHttpsDomain || false;
  //use cdn accerlated domains
  this.useCdnDomain = options.useCdnDomain || false;
  //max retry times for chunk upload
  this.maxRetryTimes = options.maxRetryTimes || 3;
  //zone of the bucket
  //z0 huadong, z1 huabei, z2 huanan, na0 beimei
  this.zone = options.zone || null;
  this.zoneExpire = options.zoneExpire || -1;
}

exports.Zone = function(srcUpHosts, cdnUpHosts, ioHost, rsHost, rsfHost,
  apiHost) {
  this.srcUpHosts = srcUpHosts || {};
  this.cdnUpHosts = cdnUpHosts || {};
  this.ioHost = ioHost || "";
  this.rsHost = rsHost || "rs.qiniu.com";
  this.rsfHost = rsfHost || "rsf.qiniu.com";
  this.apiHost = apiHost || "api.qiniu.com";
  var dotIndex = this.ioHost.indexOf(".");
  if (dotIndex != -1) {
    var ioTag = this.ioHost.substring(0, dotIndex);
    var zoneSepIndex = ioTag.indexOf("-");
    if (zoneSepIndex != -1) {
      var zoneTag = ioTag.substring(zoneSepIndex + 1);
      switch (zoneTag) {
        case "z1":
          this.rsHost = "rs-z1.qiniu.com";
          this.rsfHost = "rsf-z1.qiniu.com";
          this.apiHost = "api-z1.qiniu.com";
          break;
        case "z2":
          this.rsHost = "rs-z2.qiniu.com";
          this.rsfHost = "rsf-z2.qiniu.com";
          this.apiHost = "api-z2.qiniu.com";
          break;
        case "na0":
          this.rsHost = "rs-na0.qiniu.com";
          this.rsfHost = "rsf-na0.qiniu.com";
          this.apiHost = "api-na0.qiniu.com";
          break;
        default:
          this.rsHost = "rs.qiniu.com";
          this.rsfHost = "rsf.qiniu.com";
          this.apiHost = "api.qiniu.com";
          break;
      }
    }
  }
}
