const { connectEndStreamError, connectRPC, envdHeaders, MAX_CONNECT_ENVELOPE_BYTES } = require('./envd');
const { SandboxError } = require('./errors');
const { agentFromClient, millisecondsFromOptions, parseRequestUrl, rawRequest } = require('./util');
const { Readable } = require('stream');
const { promisify } = require('util');
const zlib = require('zlib');
const http = require('http');
const https = require('https');
const gzip = promisify(zlib.gzip);

const FileType = {
    FILE: 'file',
    DIR: 'dir'
};

const FilesystemEventType = {
    CREATE: 'create',
    WRITE: 'write',
    REMOVE: 'remove',
    RENAME: 'rename',
    CHMOD: 'chmod'
};

const ENVD_VERSION_RECURSIVE_WATCH = '0.1.4';

function versionGte (version, minimum) {
    if (!version) {
        return false;
    }
    const left = String(version).split('.').map(value => parseInt(value, 10) || 0);
    const right = String(minimum).split('.').map(value => parseInt(value, 10) || 0);
    const length = Math.max(left.length, right.length);
    for (let i = 0; i < length; i++) {
        const a = left[i] || 0;
        const b = right[i] || 0;
        if (a > b) {
            return true;
        }
        if (a < b) {
            return false;
        }
    }
    return true;
}

function normalizeFileType (type) {
    if (type === 'FILE_TYPE_DIRECTORY' || type === 'DIRECTORY' || type === 'dir') {
        return 'dir';
    }
    if (type === 'FILE_TYPE_FILE' || type === 'FILE' || type === 'file') {
        return 'file';
    }
    return type || 'unknown';
}

function normalizeEntry (entry) {
    entry = entry || {};
    return Object.assign({}, entry, {
        type: normalizeFileType(entry.type)
    });
}

function encodeConnectEnvelope (message) {
    const payload = Buffer.from(JSON.stringify(message || {}));
    const header = Buffer.alloc(5);
    header[0] = 0;
    header.writeUInt32BE(payload.length, 1);
    return Buffer.concat([header, payload]);
}

function eventPayload (message) {
    return message.event || message;
}

function normalizeWatchEventPayload (message) {
    const event = eventPayload(message);
    if (!event) {
        return {};
    }
    if (event.case) {
        const result = {};
        result[event.case] = event.value || {};
        return result;
    }
    return event;
}

function normalizeFilesystemEventType (type) {
    if (type === 1 || type === 'EVENT_TYPE_CREATE' || type === 'CREATE' || type === 'create') {
        return FilesystemEventType.CREATE;
    }
    if (type === 2 || type === 'EVENT_TYPE_WRITE' || type === 'WRITE' || type === 'write') {
        return FilesystemEventType.WRITE;
    }
    if (type === 3 || type === 'EVENT_TYPE_REMOVE' || type === 'REMOVE' || type === 'remove') {
        return FilesystemEventType.REMOVE;
    }
    if (type === 4 || type === 'EVENT_TYPE_RENAME' || type === 'RENAME' || type === 'rename') {
        return FilesystemEventType.RENAME;
    }
    if (type === 5 || type === 'EVENT_TYPE_CHMOD' || type === 'CHMOD' || type === 'chmod') {
        return FilesystemEventType.CHMOD;
    }
    return undefined;
}

function WatchHandle (request, onExit) {
    this._request = request;
    this._onExit = onExit;
    this._stopped = false;
}

WatchHandle.prototype.stop = function () {
    this._stopped = true;
    if (this._request) {
        this._request.destroy();
        this._request = null;
    }
    return Promise.resolve();
};

WatchHandle.prototype._finish = function (err) {
    if (this._stopped) {
        return;
    }
    this._stopped = true;
    if (this._onExit) {
        Promise.resolve(this._onExit(err)).catch(() => {});
    }
};

function multipartFilename (value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A');
}

function multipartBody (boundary, parts) {
    const chunks = [];
    parts.forEach(part => {
        chunks.push(Buffer.from(`--${boundary}\r\n`));
        chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.field}"; filename="${multipartFilename(part.filename)}"\r\n`));
        chunks.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'));
        const data = part.data !== undefined && part.data !== null ? part.data : '';
        chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
        chunks.push(Buffer.from('\r\n'));
    });
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return Buffer.concat(chunks);
}

function Filesystem (sandbox) {
    this.sandbox = sandbox;
}

function formatReadResult (data, opts) {
    opts = opts || {};
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data || ''));
    const format = opts.format || 'text';
    if (format === 'bytes') {
        return buffer;
    }
    if (format === 'stream') {
        return Readable.from([buffer]);
    }
    if (format === 'blob') {
        return typeof global.Blob !== 'undefined' ? new global.Blob([buffer]) : buffer;
    }
    return buffer.toString();
}

function envdAgent (sandbox, requestUrl) {
    return agentFromClient(sandbox.client, parseRequestUrl(requestUrl).protocol);
}

Filesystem.prototype.read = function (path, opts) {
    opts = opts || {};
    const headers = {};
    if (opts.gzip) {
        headers['Accept-Encoding'] = 'gzip';
    }
    const requestUrl = this.sandbox.downloadUrl(path, opts);
    return rawRequest(requestUrl, {
        method: 'GET',
        dataType: 'buffer',
        headers,
        agent: envdAgent(this.sandbox, requestUrl),
        gzip: !!opts.gzip
    }).then(({ data }) => formatReadResult(data, opts));
};

Filesystem.prototype.readText = function (path, opts) {
    return this.read(path, opts).then(data => Buffer.isBuffer(data) ? data.toString() : data);
};

Filesystem.prototype.write = function (pathOrFiles, dataOrOpts, maybeOpts) {
    if (Array.isArray(pathOrFiles)) {
        return this.writeFiles(pathOrFiles, dataOrOpts);
    }

    const path = pathOrFiles;
    const opts = maybeOpts || {};
    if (dataOrOpts && typeof dataOrOpts === 'object' && !Buffer.isBuffer(dataOrOpts) && typeof dataOrOpts.pipe === 'function') {
        return Promise.reject(new TypeError('Streams are not supported as data in filesystem.write'));
    }
    const supportsEncodedUpload = versionGte(this.sandbox.envdVersion, '0.5.7');
    if (opts.useOctetStream && supportsEncodedUpload) {
        const headers = {
            'Content-Type': 'application/octet-stream'
        };
        const content = Buffer.isBuffer(dataOrOpts) ? dataOrOpts : Buffer.from(String(dataOrOpts !== undefined && dataOrOpts !== null ? dataOrOpts : ''));
        const compressed = opts.gzip && supportsEncodedUpload
            ? gzip(content).then(result => {
                headers['Content-Encoding'] = 'gzip';
                return result;
            })
            : Promise.resolve(content);

        return compressed.then(content => {
            const requestUrl = this.sandbox.uploadUrl(path, opts);
            return rawRequest(requestUrl, {
                method: 'POST',
                content,
                dataType: 'json',
                agent: envdAgent(this.sandbox, requestUrl),
                headers
            });
        }).then(({ data }) => Array.isArray(data) ? normalizeEntry(data[0]) : normalizeEntry(data));
    }

    const boundary = `qiniu-sandbox-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const body = multipartBody(boundary, [{
        field: 'file',
        filename: path,
        data: dataOrOpts
    }]);
    const headers = {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
    };
    const compressed = opts.gzip && supportsEncodedUpload
        ? gzip(body).then(result => {
            headers['Content-Encoding'] = 'gzip';
            return result;
        })
        : Promise.resolve(body);

    return compressed.then(body => {
        const requestUrl = this.sandbox.uploadUrl(path, opts);
        return rawRequest(requestUrl, {
            method: 'POST',
            content: body,
            dataType: 'json',
            agent: envdAgent(this.sandbox, requestUrl),
            headers
        });
    }).then(({ data }) => Array.isArray(data) ? normalizeEntry(data[0]) : normalizeEntry(data));
};

Filesystem.prototype.writeFiles = function (files, opts) {
    opts = opts || {};
    const boundary = `qiniu-sandbox-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const parts = files.map(file => ({
        field: 'file',
        filename: file.path,
        data: file.data
    }));

    const requestUrl = this.sandbox.batchUploadUrl(opts);
    return rawRequest(requestUrl, {
        method: 'POST',
        content: multipartBody(boundary, parts),
        dataType: 'json',
        agent: envdAgent(this.sandbox, requestUrl),
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`
        }
    }).then(({ data }) => (data || []).map(normalizeEntry));
};

Filesystem.prototype.getInfo = function (path, opts) {
    return connectRPC(this.sandbox, '/filesystem.Filesystem/Stat', { path }, opts)
        .then(data => normalizeEntry(data.entry));
};

Filesystem.prototype.stat = Filesystem.prototype.getInfo;

Filesystem.prototype.list = function (path, opts) {
    opts = opts || {};
    return connectRPC(this.sandbox, '/filesystem.Filesystem/ListDir', {
        path,
        depth: opts.depth || 1
    }, opts).then(data => (data.entries || []).map(normalizeEntry));
};

Filesystem.prototype.exists = function (path, opts) {
    return this.getInfo(path, opts).then(() => true, err => {
        const resp = err.response || err.resp;
        if (resp && resp.statusCode === 404) {
            return false;
        }
        throw err;
    });
};

Filesystem.prototype.makeDir = function (path, opts) {
    return connectRPC(this.sandbox, '/filesystem.Filesystem/MakeDir', { path }, opts)
        .then(data => normalizeEntry(data.entry));
};

Filesystem.prototype.mkdir = Filesystem.prototype.makeDir;

Filesystem.prototype.remove = function (path, opts) {
    return connectRPC(this.sandbox, '/filesystem.Filesystem/Remove', { path }, opts)
        .then(() => null);
};

Filesystem.prototype.rename = function (oldPath, newPath, opts) {
    return connectRPC(this.sandbox, '/filesystem.Filesystem/Move', {
        source: oldPath,
        destination: newPath
    }, opts).then(data => normalizeEntry(data.entry));
};

Filesystem.prototype.move = Filesystem.prototype.rename;

Filesystem.prototype.watchDir = function (path, onEvent, opts) {
    opts = opts || {};
    if (opts.recursive && !versionGte(this.sandbox.envdVersion, ENVD_VERSION_RECURSIVE_WATCH)) {
        return Promise.reject(new SandboxError('You need to update the template to use recursive watching.'));
    }

    return watchDir(this.sandbox, path, onEvent, opts);
};

exports.Filesystem = Filesystem;
exports.FileType = FileType;
exports.FilesystemEventType = FilesystemEventType;
exports.WatchHandle = WatchHandle;
exports.normalizeEntry = normalizeEntry;

function watchDir (sandbox, path, onEvent, opts) {
    return new Promise((resolve, reject) => {
        const target = parseRequestUrl(sandbox.envdUrl() + '/filesystem.Filesystem/WatchDir');
        const transport = target.protocol === 'https:' ? https : http;
        const headers = Object.assign({
            'Content-Type': 'application/connect+json',
            'Keepalive-Ping-Interval': '50'
        }, envdHeaders(sandbox, opts.user));
        const req = transport.request({
            method: 'POST',
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port,
            path: target.path,
            headers,
            agent: agentFromClient(sandbox.client, target.protocol)
        });

        let settled = false;
        let handle;
        let responseBuffer = Buffer.alloc(0);
        let startTimer;
        let pendingCallbacks = 0;
        let streamEnded = false;

        function cleanupStartTimer () {
            if (startTimer) {
                clearTimeout(startTimer);
                startTimer = null;
            }
        }

        function finishIfIdle () {
            if (streamEnded && handle && pendingCallbacks === 0) {
                handle._finish();
            }
        }

        function fail (err) {
            cleanupStartTimer();
            if (!settled) {
                settled = true;
                reject(err);
                return;
            }
            if (handle) {
                handle._finish(err);
            }
        }

        function handleMessage (message) {
            const event = normalizeWatchEventPayload(message);
            if (event.start && !handle) {
                cleanupStartTimer();
                handle = new WatchHandle(req, opts.onExit);
                settled = true;
                resolve(handle);
                return;
            }
            if (event.filesystem && onEvent) {
                const type = normalizeFilesystemEventType(event.filesystem.type);
                if (type) {
                    try {
                        pendingCallbacks += 1;
                        Promise.resolve(onEvent({
                            name: event.filesystem.name,
                            type
                        })).then(() => {
                            pendingCallbacks -= 1;
                            finishIfIdle();
                        }, err => {
                            pendingCallbacks -= 1;
                            fail(err);
                            req.destroy();
                        });
                    } catch (err) {
                        pendingCallbacks -= 1;
                        fail(err);
                        req.destroy();
                    }
                }
            }
        }

        const startTimeout = opts.requestTimeoutMs !== undefined
            ? opts.requestTimeoutMs
            : millisecondsFromOptions(opts, 'timeout');
        if (startTimeout) {
            startTimer = setTimeout(() => {
                fail(new SandboxError('Sandbox filesystem watch start timed out'));
                req.destroy();
            }, startTimeout);
        }

        req.on('response', res => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                fail(new SandboxError(`Sandbox envd request failed with status ${res.statusCode}`, res));
                res.resume();
                return;
            }
            res.on('data', chunk => {
                responseBuffer = Buffer.concat([responseBuffer, chunk]);
                while (responseBuffer.length >= 5) {
                    const flags = responseBuffer[0];
                    const length = responseBuffer.readUInt32BE(1);
                    if (length > MAX_CONNECT_ENVELOPE_BYTES) {
                        fail(new SandboxError(`Sandbox envd stream envelope too large: ${length}`));
                        req.destroy();
                        return;
                    }
                    if (responseBuffer.length < 5 + length) {
                        break;
                    }
                    const payload = responseBuffer.slice(5, 5 + length).toString();
                    responseBuffer = responseBuffer.slice(5 + length);
                    if (flags & 2) {
                        try {
                            const err = connectEndStreamError(payload);
                            if (err) {
                                fail(err);
                                req.destroy();
                                return;
                            }
                        } catch (err) {
                            fail(err);
                            req.destroy();
                            return;
                        }
                        continue;
                    }
                    if (!(flags & 2) && payload) {
                        try {
                            handleMessage(JSON.parse(payload));
                        } catch (err) {
                            fail(err);
                            req.destroy();
                            return;
                        }
                    }
                }
            });
            res.on('error', fail);
            res.on('end', () => {
                if (responseBuffer.length > 0) {
                    fail(new SandboxError('Sandbox envd stream truncated unexpectedly'));
                    return;
                }
                cleanupStartTimer();
                if (!settled) {
                    fail(new Error('WatchDir stream ended before start event'));
                    return;
                }
                streamEnded = true;
                finishIfIdle();
            });
        });
        req.on('error', err => {
            if (handle && handle._stopped) {
                return;
            }
            fail(err);
        });
        req.end(encodeConnectEnvelope({
            path,
            recursive: !!opts.recursive
        }));
    });
}
