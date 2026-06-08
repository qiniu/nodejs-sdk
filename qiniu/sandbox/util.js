const crypto = require('crypto');
const urllib = require('urllib');

const { DEFAULT_ENDPOINT, DEFAULT_USER } = require('./constants');
const { SandboxError } = require('./errors');

function normalizeEndpoint (endpoint) {
    endpoint = endpoint || process.env.QINIU_SANDBOX_ENDPOINT || DEFAULT_ENDPOINT;
    return endpoint.replace(/\/+$/, '');
}

function encodePath (value) {
    return encodeURIComponent(value);
}

function appendQuery (path, query) {
    const pairs = [];
    query = query || {};

    Object.keys(query).forEach(key => {
        const value = query[key];
        if (value === undefined || value === null) {
            return;
        }
        if (Array.isArray(value)) {
            pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value.join(','))}`);
            return;
        }
        pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    });

    return pairs.length ? `${path}?${pairs.join('&')}` : path;
}

function timeoutSecondsFromOptions (opts) {
    opts = opts || {};
    if (opts.timeout !== undefined) {
        return opts.timeout;
    }
    if (opts.timeoutMs !== undefined) {
        return Math.ceil(opts.timeoutMs / 1000);
    }
    return undefined;
}

function copyDefined (target, source, key, outKey) {
    if (source[key] !== undefined) {
        target[outKey || key] = source[key];
    }
}

function poll (fn, opts, done) {
    opts = opts || {};
    const interval = opts.interval || opts.intervalMs || 1000;
    const timeout = opts.timeout || opts.timeoutMs || 60000;
    const startedAt = Date.now();

    function tick () {
        return fn().then(value => {
            if (done(value)) {
                return value;
            }
            if (Date.now() - startedAt >= timeout) {
                throw new SandboxError('Sandbox poll timed out');
            }
            return new Promise(resolve => setTimeout(resolve, interval)).then(tick);
        });
    }

    return tick();
}

function basicAuth (user) {
    user = user || DEFAULT_USER;
    return `Basic ${Buffer.from(`${user}:`).toString('base64')}`;
}

function fileSignature (path, operation, user, accessToken, expiration) {
    const raw = `${path}:${operation}:${user}:${accessToken}:${expiration}`;
    return `v1_${crypto.createHash('sha256').update(raw).digest('hex')}`;
}

function rawRequest (requestUrl, options) {
    options = options || {};
    return new Promise((resolve, reject) => {
        urllib.request(requestUrl, options, (err, data, resp) => {
            if (err) {
                err.resp = resp;
                reject(err);
                return;
            }
            if (resp && Math.floor(resp.statusCode / 100) !== 2) {
                reject(new SandboxError(`Sandbox envd request failed with status ${resp.statusCode}`, resp, data));
                return;
            }
            resolve({
                data,
                resp
            });
        });
    });
}

function parseJSON (data) {
    if (Buffer.isBuffer(data)) {
        data = data.toString();
    }
    if (typeof data === 'string') {
        return data ? JSON.parse(data) : {};
    }
    return data || {};
}

function shellQuote (value) {
    const quote = String.fromCharCode(39);
    return quote + String(value).replace(/'/g, quote + '\\' + quote + quote) + quote;
}

exports.normalizeEndpoint = normalizeEndpoint;
exports.encodePath = encodePath;
exports.appendQuery = appendQuery;
exports.timeoutSecondsFromOptions = timeoutSecondsFromOptions;
exports.copyDefined = copyDefined;
exports.poll = poll;
exports.basicAuth = basicAuth;
exports.fileSignature = fileSignature;
exports.rawRequest = rawRequest;
exports.parseJSON = parseJSON;
exports.shellQuote = shellQuote;
