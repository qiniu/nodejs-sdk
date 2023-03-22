const urllib = require('urllib');
const util = require('util');
const conf = require('./conf');

// huadong
exports.Zone_z0 = new conf.Zone([
    'up.qiniup.com'
], [
    'upload.qiniup.com'
], 'iovip.qbox.me',
'rs.qbox.me',
'rsf.qbox.me',
'api.qiniuapi.com');

// huadong2
exports.Zone_cn_east_2 = new conf.Zone([
    'up-cn-east-2.qiniup.com'
], [
    'upload-cn-east-2.qiniup.com'
], 'iovip-cn-east-2.qiniuio.com',
'rs-cn-east-2.qiniuapi.com',
'rsf-cn-east-2.qiniuapi.com',
'api-cn-east-2.qiniuapi.com');

// huabei
exports.Zone_z1 = new conf.Zone([
    'up-z1.qiniup.com'
], [
    'upload-z1.qiniup.com'
], 'iovip-z1.qbox.me',
'rs-z1.qbox.me',
'rsf-z1.qbox.me',
'api-z1.qiniuapi.com');

// huanan
exports.Zone_z2 = new conf.Zone([
    'up-z2.qiniup.com'
], [
    'upload-z2.qiniup.com'
], 'iovip-z2.qbox.me',
'rs-z2.qbox.me',
'rsf-z2.qbox.me',
'api-z2.qiniuapi.com');

// beimei
exports.Zone_na0 = new conf.Zone([
    'up-na0.qiniup.com'
], [
    'upload-na0.qiniup.com'
], 'iovip-na0.qbox.me',
'rs-na0.qbox.me',
'rsf-na0.qbox.me',
'api-na0.qiniuapi.com');

// singapore
exports.Zone_as0 = new conf.Zone([
    'up-as0.qiniup.com'
], [
    'upload-as0.qiniup.com'
], 'iovip-as0.qbox.me',
'rs-as0.qbox.me',
'rsf-as0.qbox.me',
'api-as0.qiniuapi.com');

// seoul
exports.Zone_ap_northeast_1 = new conf.Zone([
    'up-ap-northeast-1.qiniup.com'
], [
    'upload-ap-northeast-1.qiniup.com'
], 'iovip-ap-northeast-1.qiniuio.com',
'rs-ap-northeast-1.qiniuapi.com',
'rsf-ap-northeast-1.qiniuapi.com',
'api-ap-northeast-1.qiniuapi.com');

exports.getZoneInfo = function (accessKey, bucket, callbackFunc) {
    const apiAddr = util.format(
        'https://%s/v2/query?ak=%s&bucket=%s',
        conf.UC_HOST,
        accessKey,
        bucket
    );
    urllib.request(apiAddr, function (respErr, respData, respInfo) {
        if (respErr) {
            callbackFunc(respErr, null, null);
            return;
        }

        if (respInfo.statusCode != 200) {
            // not ok
            respErr = new Error(respInfo.statusCode + '\n' + respData);
            callbackFunc(respErr, null, null);
            return;
        }

        const zoneData = JSON.parse(respData);
        const srcUpHosts = [];
        const cdnUpHosts = [];
        let zoneExpire = 0;

        try {
            zoneExpire = zoneData.ttl;
            // read src hosts
            zoneData.up.src.main.forEach(function (host) {
                srcUpHosts.push(host);
            });
            if (zoneData.up.src.backup) {
                zoneData.up.src.backup.forEach(function (host) {
                    srcUpHosts.push(host);
                });
            }

            // read acc hosts
            zoneData.up.acc.main.forEach(function (host) {
                cdnUpHosts.push(host);
            });
            if (zoneData.up.acc.backup) {
                zoneData.up.acc.backup.forEach(function (host) {
                    cdnUpHosts.push(host);
                });
            }

            const ioHost = zoneData.io.src.main[0];
            const rsHost = zoneData.rs.acc.main[0];
            const rsfHost = zoneData.rsf.acc.main[0];
            const apiHost = zoneData.api.acc.main[0];
            const zoneInfo = new conf.Zone(
                srcUpHosts,
                cdnUpHosts,
                ioHost,
                rsHost,
                rsfHost,
                apiHost
            );
            callbackFunc(null, zoneInfo, zoneExpire);
        } catch (e) {
            callbackFunc(e, null, null);
        }
    });
};
