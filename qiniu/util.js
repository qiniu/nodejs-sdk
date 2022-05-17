const url = require('url');
const crypto = require('crypto');
const zone = require('./zone');

// Check Timestamp Expired or not
exports.isTimestampExpired = function (timestamp) {
    return timestamp < parseInt(Date.now() / 1000);
};

// Format Data
exports.formatDateUTC = function (date, layout) {
    function pad (num, digit) {
        const d = digit || 2;
        let result = num.toString();
        while (result.length < d) {
            result = '0' + result;
        }
        return result;
    }

    const d = new Date(date);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const hour = d.getUTCHours();
    const minute = d.getUTCMinutes();
    const second = d.getUTCSeconds();
    const millisecond = d.getUTCMilliseconds();

    let result = layout || 'YYYY-MM-DDTHH:MM:ss.SSSZ';

    result = result.replace(/YYYY/g, year.toString())
        .replace(/MM/g, pad(month))
        .replace(/DD/g, pad(day))
        .replace(/HH/g, pad(hour))
        .replace(/mm/g, pad(minute))
        .replace(/ss/g, pad(second))
        .replace(/SSS/g, pad(millisecond, 3));

    return result;
};

// Encoded Entry
exports.encodedEntry = function (bucket, key) {
    return exports.urlsafeBase64Encode(bucket + (key ? ':' + key : ''));
};

// Get accessKey from uptoken
exports.getAKFromUptoken = function (uploadToken) {
    var sepIndex = uploadToken.indexOf(':');
    return uploadToken.substring(0, sepIndex);
};

// Get bucket from uptoken
exports.getBucketFromUptoken = function (uploadToken) {
    var sepIndex = uploadToken.lastIndexOf(':');
    var encodedPutPolicy = uploadToken.substring(sepIndex + 1);
    var putPolicy = exports.urlSafeBase64Decode(encodedPutPolicy);
    var putPolicyObj = JSON.parse(putPolicy);
    var scope = putPolicyObj.scope;
    var scopeSepIndex = scope.indexOf(':');
    if (scopeSepIndex == -1) {
        return scope;
    } else {
        return scope.substring(0, scopeSepIndex);
    }
};

exports.base64ToUrlSafe = function (v) {
    return v.replace(/\//g, '_').replace(/\+/g, '-');
};

exports.urlSafeToBase64 = function (v) {
    return v.replace(/_/g, '/').replace(/-/g, '+');
};

// UrlSafe Base64 Decode
exports.urlsafeBase64Encode = function (jsonFlags) {
    var encoded = Buffer.from(jsonFlags).toString('base64');
    return exports.base64ToUrlSafe(encoded);
};

// UrlSafe Base64 Decode
exports.urlSafeBase64Decode = function (fromStr) {
    return Buffer.from(exports.urlSafeToBase64(fromStr), 'base64').toString();
};

// Hmac-sha1 Crypt
exports.hmacSha1 = function (encodedFlags, secretKey) {
    /*
   *return value already encoded with base64
   * */
    var hmac = crypto.createHmac('sha1', secretKey);
    hmac.update(encodedFlags);
    return hmac.digest('base64');
};

// get md5
exports.getMd5 = function (data) {
    var md5 = crypto.createHash('md5');
    return md5.update(data).digest('hex');
};

// 创建 AccessToken 凭证
// @param mac         AK&SK对象
// @param requestURI 请求URL
// @param reqBody    请求Body，仅当请求的 ContentType 为
//                   application/x-www-form-urlencoded时才需要传入该参数
exports.generateAccessToken = function (mac, requestURI, reqBody) {
    var u = new url.URL(requestURI);
    var path = u.pathname + u.search;
    var access = path + '\n';

    if (reqBody) {
        access += reqBody;
    }

    var digest = exports.hmacSha1(access, mac.secretKey);
    var safeDigest = exports.base64ToUrlSafe(digest);
    return 'QBox ' + mac.accessKey + ':' + safeDigest;
};

const isTokenTable = {
    '!': true,
    '#': true,
    $: true,
    '%': true,
    '&': true,
    '\\': true,
    '*': true,
    '+': true,
    '-': true,
    '.': true,
    0: true,
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
    6: true,
    7: true,
    8: true,
    9: true,
    A: true,
    B: true,
    C: true,
    D: true,
    E: true,
    F: true,
    G: true,
    H: true,
    I: true,
    J: true,
    K: true,
    L: true,
    M: true,
    N: true,
    O: true,
    P: true,
    Q: true,
    R: true,
    S: true,
    T: true,
    U: true,
    W: true,
    V: true,
    X: true,
    Y: true,
    Z: true,
    '^': true,
    _: true,
    '`': true,
    a: true,
    b: true,
    c: true,
    d: true,
    e: true,
    f: true,
    g: true,
    h: true,
    i: true,
    j: true,
    k: true,
    l: true,
    m: true,
    n: true,
    o: true,
    p: true,
    q: true,
    r: true,
    s: true,
    t: true,
    u: true,
    v: true,
    w: true,
    x: true,
    y: true,
    z: true,
    '|': true,
    '~': true
};
/**
 * 是否合法的 header field name 字符
 * @param ch string
 * @return boolean|undefined
 */
function validHeaderKeyChar (ch) {
    if (ch.charCodeAt(0) >= 128) {
        return false;
    }
    return isTokenTable[ch];
}

/**
 * 规范化 header field name
 * @param fieldName string
 * @return string
 */
exports.canonicalMimeHeaderKey = function (fieldName) {
    for (const ch of fieldName) {
        if (!validHeaderKeyChar(ch)) {
            return fieldName;
        }
    }
    return fieldName.split('-')
        .map(function (text) {
            return text.substring(0, 1).toUpperCase() + text.substring(1).toLowerCase();
        })
        .join('-');
};

// 创建 AccessToken 凭证
// @param mac            AK&SK对象
// @param requestURI     请求URL
// @param reqMethod      请求方法，例如 GET，POST
// @param reqContentType 请求类型，例如 application/json 或者  application/x-www-form-urlencoded
// @param reqBody        请求Body，仅当请求的 ContentType 为 application/json 或者
//                       application/x-www-form-urlencoded 时才需要传入该参数
exports.generateAccessTokenV2 = function (mac, requestURI, reqMethod, reqContentType, reqBody, reqHeaders) {
    var u = new url.URL(requestURI);
    var path = u.pathname;
    var search = u.search;
    var host = u.host;
    var port = u.port;

    var access = reqMethod.toUpperCase() + ' ' + path;
    if (search) {
        access += search;
    }
    // add host
    access += '\nHost: ' + host;
    // add port
    if (port) {
        access += ':' + port;
    }

    // add content type
    if (reqContentType) {
        access += '\nContent-Type: ' + reqContentType;
    } else {
        access += '\nContent-Type: application/x-www-form-urlencoded';
    }

    // add headers
    if (reqHeaders) {
        const canonicalHeaders = Object.keys(reqHeaders)
            .reduce(function (acc, k) {
                acc[exports.canonicalMimeHeaderKey(k)] = reqHeaders[k];
                return acc;
            }, {});
        const headerText = Object.keys(canonicalHeaders)
            .filter(function (k) {
                return k.startsWith('X-Qiniu-') && k.length > 'X-Qiniu-'.length;
            })
            .sort()
            .map(function (k) {
                return k + ': ' + canonicalHeaders[k];
            })
            .join('\n');
        if (headerText) {
            access += '\n' + headerText;
        }
    }

    access += '\n\n';

    // add reqbody
    if (reqBody && reqContentType !== 'application/octet-stream') {
        access += reqBody;
    }

    var digest = exports.hmacSha1(access, mac.secretKey);
    var safeDigest = exports.base64ToUrlSafe(digest);
    return 'Qiniu ' + mac.accessKey + ':' + safeDigest;
};

// 校验七牛上传回调的Authorization
// @param mac           AK&SK对象
// @param requestURI   回调的URL中的requestURI
// @param reqBody      请求Body，仅当请求的ContentType为
//                     application/x-www-form-urlencoded时才需要传入该参数
// @param callbackAuth 回调时请求的Authorization头部值
exports.isQiniuCallback = function (mac, requestURI, reqBody, callbackAuth) {
    var auth = exports.generateAccessToken(mac, requestURI, reqBody);
    return auth === callbackAuth;
};

exports.prepareZone = function (ctx, accessKey, bucket, callback) {
    var useCache = false;
    if (ctx.config.zone !== '' && ctx.config.zone != null) {
        if (ctx.config.zoneExpire === -1) {
            useCache = true;
        } else {
            if (!exports.isTimestampExpired(ctx.config.zoneExpire)) {
                useCache = true;
            }
        }
    }

    if (useCache) {
        callback(null, ctx);
    } else {
        zone.getZoneInfo(accessKey, bucket, function (err, cZoneInfo,
            cZoneExpire) {
            if (err) {
                callback(err);
                return;
            }
            // update object
            ctx.config.zone = cZoneInfo;
            ctx.config.zoneExpire = cZoneExpire + parseInt(Date.now() / 1000);
            callback(null, ctx);
        });
    }
};
