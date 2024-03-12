const rpc = require('./rpc');
const { RetryDomainsMiddleware } = require('./httpc/middleware');

/**
 * @deprecated use qiniu/httpc/region.js instead
 * @param {string[]} srcUpHosts
 * @param {string[]} cdnUpHosts
 * @param {string} ioHost
 * @param {string} rsHost
 * @param {string} rsfHost
 * @param {string} apiHost
 * @constructor
 */
function Zone (
    srcUpHosts,
    cdnUpHosts,
    ioHost,
    rsHost,
    rsfHost,
    apiHost
) {
    this.srcUpHosts = srcUpHosts || [];
    this.cdnUpHosts = cdnUpHosts || [];
    this.ioHost = ioHost || '';
    this.rsHost = rsHost;
    this.rsfHost = rsfHost;
    this.apiHost = apiHost;

    // set specific hosts if possible
    const dotIndex = this.ioHost.indexOf('.');
    if (dotIndex !== -1) {
        const ioTag = this.ioHost.substring(0, dotIndex);
        const zoneSepIndex = ioTag.indexOf('-');
        if (zoneSepIndex !== -1) {
            const zoneTag = ioTag.substring(zoneSepIndex + 1);
            switch (zoneTag) {
            case 'z1':
                !this.rsHost && (this.rsHost = 'rs-z1.qbox.me');
                !this.rsfHost && (this.rsfHost = 'rsf-z1.qbox.me');
                !this.apiHost && (this.apiHost = 'api-z1.qiniuapi.com');
                break;
            case 'z2':
                !this.rsHost && (this.rsHost = 'rs-z2.qbox.me');
                !this.rsfHost && (this.rsfHost = 'rsf-z2.qbox.me');
                !this.apiHost && (this.apiHost = 'api-z2.qiniuapi.com');
                break;
            case 'na0':
                !this.rsHost && (this.rsHost = 'rs-na0.qbox.me');
                !this.rsfHost && (this.rsfHost = 'rsf-na0.qbox.me');
                !this.apiHost && (this.apiHost = 'api-na0.qiniuapi.com');
                break;
            case 'as0':
                !this.rsHost && (this.rsHost = 'rs-as0.qbox.me');
                !this.rsfHost && (this.rsfHost = 'rsf-as0.qbox.me');
                !this.apiHost && (this.apiHost = 'api-as0.qiniuapi.com');
                break;
            }
        }
    }

    !this.rsHost && (this.rsHost = 'rs.qiniu.com');
    !this.rsfHost && (this.rsfHost = 'rsf.qiniu.com');
    !this.apiHost && (this.apiHost = 'api.qiniuapi.com');
}

exports.Zone = Zone;

/**
 * huadong
 * @type {Zone}
 * @deprecated use Region.fromRegionId('z0') instead
 */
exports.Zone_z0 = new Zone([
    'up.qiniup.com'
], [
    'upload.qiniup.com'
], 'iovip.qbox.me',
'rs.qbox.me',
'rsf.qbox.me',
'api.qiniuapi.com');

/**
 * huadong2
 * @type {Zone}
 * @deprecated use Region.fromRegionId('cn-east-2') instead
 */
exports.Zone_cn_east_2 = new Zone([
    'up-cn-east-2.qiniup.com'
], [
    'upload-cn-east-2.qiniup.com'
], 'iovip-cn-east-2.qiniuio.com',
'rs-cn-east-2.qiniuapi.com',
'rsf-cn-east-2.qiniuapi.com',
'api-cn-east-2.qiniuapi.com');

/**
 * huabei
 * @type {Zone}
 * @deprecated use Region.fromRegionId('z1') instead
 */
exports.Zone_z1 = new Zone([
    'up-z1.qiniup.com'
], [
    'upload-z1.qiniup.com'
], 'iovip-z1.qbox.me',
'rs-z1.qbox.me',
'rsf-z1.qbox.me',
'api-z1.qiniuapi.com');

/**
 * huanan
 * @type {Zone}
 * @deprecated use Region.fromRegionId('z2') instead
 */
exports.Zone_z2 = new Zone([
    'up-z2.qiniup.com'
], [
    'upload-z2.qiniup.com'
], 'iovip-z2.qbox.me',
'rs-z2.qbox.me',
'rsf-z2.qbox.me',
'api-z2.qiniuapi.com');

/**
 * beimei
 * @type {Zone}
 * @deprecated use Region.fromRegionId('na0') instead
 */
exports.Zone_na0 = new Zone([
    'up-na0.qiniup.com'
], [
    'upload-na0.qiniup.com'
], 'iovip-na0.qbox.me',
'rs-na0.qbox.me',
'rsf-na0.qbox.me',
'api-na0.qiniuapi.com');

/**
 * singapore
 * @type {Zone}
 * @deprecated use Region.fromRegionId('as0') instead
 */
exports.Zone_as0 = new Zone([
    'up-as0.qiniup.com'
], [
    'upload-as0.qiniup.com'
], 'iovip-as0.qbox.me',
'rs-as0.qbox.me',
'rsf-as0.qbox.me',
'api-as0.qiniuapi.com');

/**
 * @deprecated use QueryRegionsProvider instead
 * @param {string} accessKey
 * @param {string} bucket
 * @param {function(Error | null, any, any)} callbackFunc
 */
exports.getZoneInfo = function (accessKey, bucket, callbackFunc) {
    // resolve cycle dependency by require dynamically
    const conf = require('./conf');
    const apiAddr = 'https://' + conf.QUERY_REGION_HOST + '/v4/query';

    rpc.qnHttpClient.get({
        url: apiAddr,
        params: {
            ak: accessKey,
            bucket: bucket
        },
        middlewares: [
            new RetryDomainsMiddleware({
                backupDomains: conf.QUERY_REGION_BACKUP_HOSTS
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
                const hosts = respData.hosts;
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
                const zoneInfo = new Zone(
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
