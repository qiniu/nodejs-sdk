const { basicAuth, parseJSON, rawRequest } = require('./util');

function envdHeaders (sandbox, user) {
    const headers = {
        Authorization: basicAuth(user)
    };
    if (sandbox.envdAccessToken) {
        headers['X-Access-Token'] = sandbox.envdAccessToken;
    }
    return headers;
}

function parseConnectResponse (data) {
    if (data && data.result !== undefined) {
        return data.result;
    }
    return data;
}

function connectRPC (sandbox, procedure, body, opts) {
    opts = opts || {};
    const headers = Object.assign({
        'Content-Type': 'application/json'
    }, envdHeaders(sandbox, opts.user));
    if (opts.keepalive) {
        headers['Keepalive-Ping-Interval'] = '50';
    }

    return rawRequest(sandbox.envdUrl() + procedure, {
        method: 'POST',
        content: JSON.stringify(body || {}),
        dataType: 'text',
        headers,
        timeout: opts.requestTimeoutMs || opts.timeoutMs || opts.timeout
    }).then(({ data }) => parseConnectResponse(parseJSON(data)));
}

function encodeConnectEnvelope (message) {
    const payload = Buffer.from(JSON.stringify(message || {}));
    const header = Buffer.alloc(5);
    header[0] = 0;
    header.writeUInt32BE(payload.length, 1);
    return Buffer.concat([header, payload]);
}

function decodeConnectEnvelopes (data) {
    data = Buffer.isBuffer(data) ? data : Buffer.from(data || '');
    const messages = [];
    let offset = 0;
    while (offset + 5 <= data.length) {
        const flags = data[offset];
        const length = data.readUInt32BE(offset + 1);
        offset += 5;
        if (offset + length > data.length) {
            break;
        }
        const payload = data.slice(offset, offset + length).toString();
        offset += length;
        if (flags & 2) {
            continue;
        }
        if (payload) {
            messages.push(JSON.parse(payload));
        }
    }
    return messages;
}

function eventListFromResponse (data) {
    if (Array.isArray(data.events)) {
        return data.events;
    }
    if (Array.isArray(data)) {
        return data;
    }
    if (data.event) {
        return [data];
    }
    return [];
}

function connectStreamRPC (sandbox, procedure, body, opts) {
    opts = opts || {};
    const headers = Object.assign({
        'Content-Type': 'application/connect+json'
    }, envdHeaders(sandbox, opts.user));
    if (opts.keepalive) {
        headers['Keepalive-Ping-Interval'] = '50';
    }

    return rawRequest(sandbox.envdUrl() + procedure, {
        method: 'POST',
        content: encodeConnectEnvelope(body),
        dataType: 'buffer',
        headers,
        timeout: opts.requestTimeoutMs || opts.timeoutMs || opts.timeout
    }).then(({ data, resp }) => {
        const contentType = (resp.headers && resp.headers['content-type']) || '';
        if (contentType.indexOf('application/connect+json') >= 0) {
            return decodeConnectEnvelopes(data);
        }
        return eventListFromResponse(parseJSON(data));
    });
}

exports.connectRPC = connectRPC;
exports.connectStreamRPC = connectStreamRPC;
exports.envdHeaders = envdHeaders;
