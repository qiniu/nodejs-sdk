const conf = require('./conf');
const { RetryDomainsMiddleware } = require('./httpc/middleware');
const rpc = require('./rpc');

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

exports.getZoneInfo = function (accessKey, bucket, callbackFunc) {
    const apiAddr = 'https://' + conf.UC_HOST + '/v4/query';

    rpc.qnHttpClient.get({
        url: apiAddr,
        params: {
            ak: accessKey,
            bucket: bucket
        },
        middlewares: [
            new RetryDomainsMiddleware({
                backupDomains: conf.UC_BACKUP_HOSTS
            })
        ],
        callback: function (respErr, respData, respInfo) {
            if (respErr) {
                callbackFunc(respErr, null, null);
                return;
            }

            if (respInfo.statusCode !== 200) {
                // not ok
                respErr = new Error(respInfo.statusCode + '\n' + respData);
                callbackFunc(respErr, null, null);
                return;
            }

            let zoneData;
            try {
                const hosts = JSON.parse(respData).hosts;
                if (!hosts || !hosts.length) {
                    respErr = new Error('no host available: ' + respData);
                    callbackFunc(respErr, null, null);
                    return;
                }
                zoneData = hosts[0];
            } catch (err) {
                callbackFunc(err, null, null);
                return;
            }
            let srcUpHosts = [];
            let cdnUpHosts = [];
            let zoneExpire = 0;

            try {
                zoneExpire = zoneData.ttl;
                // read src hosts
                srcUpHosts = zoneData.up.domains;

                // read acc hosts
                cdnUpHosts = zoneData.up.domains;

                const ioHost = zoneData.io.domains[0];
                const rsHost = zoneData.rs.domains[0];
                const rsfHost = zoneData.rsf.domains[0];
                const apiHost = zoneData.api.domains[0];
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
        }
    });
};
