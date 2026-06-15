const crypto = require('crypto');
const urllib = require('urllib');

const { DEFAULT_ENDPOINT, DEFAULT_USER } = require('./constants');
const { SandboxError, TimeoutError } = require('./errors');

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

function millisecondsFromOptions (opts, key, defaultValue) {
    opts = opts || {};
    const msKey = `${key}Ms`;
    if (opts[msKey] !== undefined) {
        return opts[msKey];
    }
    if (opts[key] !== undefined) {
        return opts[key] * 1000;
    }
    return defaultValue;
}

function copyDefined (target, source, key, outKey) {
    if (source[key] !== undefined) {
        target[outKey || key] = source[key];
    }
}

function poll (fn, opts, done) {
    opts = opts || {};
    const interval = millisecondsFromOptions(opts, 'interval', 1000);
    const timeout = millisecondsFromOptions(opts, 'timeout', 60000);
    const startedAt = Date.now();

    function tick () {
        return fn().then(value => {
            if (done(value)) {
                return value;
            }
            if (Date.now() - startedAt >= timeout) {
                throw new TimeoutError('Sandbox poll timed out');
            }
            return new Promise(resolve => setTimeout(resolve, interval)).then(tick);
        }, err => {
            const statusCode = (err.response && err.response.statusCode) || (err.resp && err.resp.statusCode);
            const fatalClientError = statusCode >= 400 && statusCode < 500 && statusCode !== 408 && statusCode !== 429;
            if (fatalClientError || Date.now() - startedAt >= timeout) {
                throw err;
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

function agentFromClient (client, protocol) {
    if (!client) {
        return undefined;
    }
    const source = client.httpClient || client;
    return protocol === 'https:' ? source.httpsAgent : source.httpAgent;
}

function parseRequestUrl (requestUrl) {
    const URLParser = (typeof URL !== 'undefined' && URL) || null;
    if (URLParser) {
        try {
            const parsed = new URLParser(requestUrl);
            return {
                protocol: parsed.protocol,
                hostname: parsed.hostname.replace(/^\[|\]$/g, ''),
                port: parsed.port,
                path: parsed.pathname + parsed.search
            };
        } catch (err) {
            throw new SandboxError(`Invalid request URL: ${requestUrl}`);
        }
    }

    const match = String(requestUrl).match(/^(https?:)\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/);
    if (!match) {
        throw new SandboxError(`Invalid request URL: ${requestUrl}`);
    }

    const host = match[2];
    let hostname = host;
    let port = '';
    if (host.charAt(0) === '[') {
        const end = host.indexOf(']');
        hostname = host.slice(1, end);
        if (host.charAt(end + 1) === ':') {
            port = host.slice(end + 2);
        }
    } else {
        const colon = host.lastIndexOf(':');
        if (colon > 0 && host.indexOf(':') === colon) {
            hostname = host.slice(0, colon);
            port = host.slice(colon + 1);
        }
    }

    return {
        protocol: match[1],
        hostname,
        port,
        path: (match[3] || '/') + (match[4] || '')
    };
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
exports.millisecondsFromOptions = millisecondsFromOptions;
exports.copyDefined = copyDefined;
exports.poll = poll;
exports.basicAuth = basicAuth;
exports.fileSignature = fileSignature;
exports.rawRequest = rawRequest;
exports.agentFromClient = agentFromClient;
exports.parseRequestUrl = parseRequestUrl;
exports.parseJSON = parseJSON;
exports.shellQuote = shellQuote;
