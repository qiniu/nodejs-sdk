const urllib = require('urllib')
const util = require('util')
const conf = require('./conf');

//huadong
exports.Zone_z0 = new conf.Zone([
    'up.qiniup.com',
    'up-nb.qiniup.com',
    'up-xs.qiniup.com',
  ], [
    'upload.qiniup.com',
    'upload-nb.qiniup.com',
    'upload-xs.qiniup.com',
  ], 'iovip.qbox.me',
  'rs.qiniu.com',
  'api.qiniu.com');

//huabei
exports.Zone_z1 = new conf.Zone([
    'up-z1.qiniup.com',
  ], [
    'upload-z1.qiniup.com',
  ], 'iovip-z1.qbox.me',
  'rs-z1.qiniu.com',
  'api-z1.qiniu.com');

//huanan
exports.Zone_z2 = new conf.Zone([
    'up-z2.qiniup.com',
    'up-gz.qiniup.com',
    'up-fs.qiniup.com'
  ], [
    'upload-z2.qiniup.com',
    'upload-gz.qiniup.com',
    'upload-fs.qiniup.com',
  ], 'iovip-z2.qbox.me',
  'rs-z2.qiniu.com',
  'api-z2.qiniu.com');


//beimei
exports.Zone_na0 = new conf.Zone([
    'up-na0.qiniup.com',
  ], [
    'upload-na0.qiniup.com',
  ], 'iovip-na0.qbox.me',
  'rs-na0.qiniu.com',
  'api-na0.qiniu.com')


exports.getZoneInfo = function(accessKey, bucket, callbackFunc) {
  var apiAddr = util.format('http://uc.qbox.me/v2/query?ak=%s&bucket=%s',
    accessKey, bucket);
  urllib.request(apiAddr, function(respErr, respData, respInfo) {
    if (respErr) {
      callback(respErr, null, null);
      return;
    }

    if (respInfo.statusCode != 200) {
      //not ok
      respErr = new Error(respInfo.statusCode + "\n" + respData);
      callbackFunc(respErr, null, null);
      return;
    }

    var zoneData = JSON.parse(respData);
    var srcHosts = [];
    var cdnHosts = [];
    var zoneExpire = 0;

    try {
      zoneExpire = zoneData.ttl;
      //read src hosts
      zoneData.up.src.main.forEach(function(host) {
        srcHosts.push(host);
      });
      if (zoneData.up.src.backup) {
        zoneData.up.src.backup.forEach(function(host) {
          srcHosts.push(host);
        });
      }

      //read acc hosts
      zoneData.up.acc.main.forEach(function(host) {
        cdnHosts.push(host);
      });
      if (zoneData.up.acc.backup) {
        zoneData.up.acc.backup.forEach(function(host) {
          cdnHosts.push(host);
        });
      }

      var ioHost = zoneData.io.src.main[0];
      var zoneInfo = new conf.Zone(srcHosts, cdnHosts, ioHost)
      callbackFunc(null, zoneInfo, zoneExpire);
    } catch (e) {
      callbackFunc(e, null, null);
    }
  });
}
