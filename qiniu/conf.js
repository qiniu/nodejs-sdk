const os = require('os');
const pkg = require('../package.json');

exports.ACCESS_KEY = '<PLEASE APPLY YOUR ACCESS KEY>';
exports.SECRET_KEY = '<DONT SEND YOUR SECRET KEY TO ANYONE>';

var defaultUserAgent = function () {
    return 'QiniuNodejs/' + pkg.version + ' (' + os.type() + '; ' + os.platform() +
        '; ' + os.arch() + '; )';
};

exports.USER_AGENT = defaultUserAgent();
exports.BLOCK_SIZE = 4 * 1024 * 1024; // 4MB, never change

// define api form mime type
exports.FormMimeUrl = 'application/x-www-form-urlencoded';
exports.FormMimeJson = 'application/json';
exports.FormMimeRaw = 'application/octet-stream';
exports.RS_HOST = 'rs.qiniu.com';
exports.RPC_TIMEOUT = 600000; // 600s
exports.UC_HOST = 'uc.qbox.me';

// proxy
exports.RPC_HTTP_AGENT = null;
exports.RPC_HTTPS_AGENT = null;

exports.Config = function Config(options) {
    options = options || {};
    // use http or https protocol
    this.useHttpsDomain = !!(options.useHttpsDomain || false);
    // use cdn accerlated domains
    this.useCdnDomain = !!(options.useCdnDomain && true);
    // zone of the bucket
    // z0 huadong, z1 huabei, z2 huanan, na0 beimei
    this.zone = options.zone || null;
    this.zoneExpire = options.zoneExpire || -1;
};

exports.Zone = function (
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
                !this.apiHost && (this.apiHost = 'api-z1.qiniu.com');
                break;
            case 'z2':
                !this.rsHost && (this.rsHost = 'rs-z2.qbox.me');
                !this.rsfHost && (this.rsfHost = 'rsf-z2.qbox.me');
                !this.apiHost && (this.apiHost = 'api-z2.qiniu.com');
                break;
            case 'na0':
                !this.rsHost && (this.rsHost = 'rs-na0.qbox.me');
                !this.rsfHost && (this.rsfHost = 'rsf-na0.qbox.me');
                !this.apiHost && (this.apiHost = 'api-na0.qiniu.com');
                break;
            case 'as0':
                !this.rsHost && (this.rsHost = 'rs-as0.qbox.me');
                !this.rsfHost && (this.rsfHost = 'rsf-as0.qbox.me');
                !this.apiHost && (this.apiHost = 'api-as0.qiniu.com');
                break;
            }
        }
    }

    !this.rsHost && (this.rsHost = 'rs.qiniu.com');
    !this.rsfHost && (this.rsfHost = 'rsf.qiniu.com');
    !this.apiHost && (this.apiHost = 'api.qiniu.com');
};
