const { connectEndStreamError, connectRPC, envdHeaders, MAX_CONNECT_ENVELOPE_BYTES } = require('./envd');
const { agentFromClient, millisecondsFromOptions, parseRequestUrl } = require('./util');
const http = require('http');
const https = require('https');

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

function dataToBuffer (value) {
    if (Buffer.isBuffer(value)) {
        return value;
    }
    if (Array.isArray(value)) {
        return Buffer.from(value);
    }
    if (typeof value === 'string') {
        return Buffer.from(value, 'base64');
    }
    return Buffer.from(String(value || ''));
}

function LivePtyHandle (pty, pid, request, waitPromise, opts) {
    this.pty = pty;
    this.pid = pid;
    this._request = request;
    this._waitPromise = waitPromise;
    this.opts = opts || {};
    this.stdout = '';
    this.stderr = '';
}

LivePtyHandle.prototype.wait = function () {
    return this._waitPromise;
};

LivePtyHandle.prototype.kill = function () {
    return this.pty.kill(this.pid, {
        user: this.opts.user,
        requestTimeoutMs: this.opts.requestTimeoutMs,
        timeoutMs: this.opts.timeoutMs,
        timeout: this.opts.timeout
    });
};

LivePtyHandle.prototype.disconnect = function () {
    if (this._request) {
        this._disconnected = true;
        this._request.destroy();
        this._request = null;
    }
    return Promise.resolve();
};

function connectLivePty (sandbox, procedure, body, opts, pty) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
        const target = parseRequestUrl(sandbox.envdUrl() + procedure);
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
        let result = {
            exitCode: -1,
            stdout: '',
            stderr: ''
        };
        let resolveWait;
        let rejectWait;
        const waitPromise = new Promise((resolve, reject) => {
            resolveWait = resolve;
            rejectWait = reject;
        });
        waitPromise.catch(() => {});
        let startTimer;

        function cleanupStartTimer () {
            if (startTimer) {
                clearTimeout(startTimer);
                startTimer = null;
            }
        }

        function fail (err) {
            cleanupStartTimer();
            if (handle && handle._disconnected) {
                if (result.exitCode === -1) {
                    result.exitCode = 0;
                }
                resolveWait(result);
                return;
            }
            if (!settled) {
                settled = true;
                reject(err);
            }
            rejectWait(err);
        }

        function handleMessage (message) {
            const event = eventPayload(message);
            if (event.start && !handle) {
                cleanupStartTimer();
                handle = new LivePtyHandle(pty, event.start.pid, req, waitPromise, opts);
                settled = true;
                resolve(handle);
            }
            if (event.data) {
                if (event.data.pty !== undefined && opts.onData) {
                    opts.onData(dataToBuffer(event.data.pty));
                }
                if (event.data.stdout !== undefined) {
                    const out = dataToBuffer(event.data.stdout).toString();
                    result.stdout += out;
                    if (handle) {
                        handle.stdout += out;
                    }
                }
                if (event.data.stderr !== undefined) {
                    const err = dataToBuffer(event.data.stderr).toString();
                    result.stderr += err;
                    if (handle) {
                        handle.stderr += err;
                    }
                }
            }
            if (event.end) {
                result = Object.assign(result, {
                    exitCode: event.end.exitCode === undefined ? 0 : event.end.exitCode,
                    error: event.end.error || ''
                });
                resolveWait(result);
            }
        }

        req.on('response', res => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                fail(new Error(`Sandbox envd request failed with status ${res.statusCode}`));
                res.resume();
                return;
            }
            res.on('data', chunk => {
                responseBuffer = Buffer.concat([responseBuffer, chunk]);
                while (responseBuffer.length >= 5) {
                    const flags = responseBuffer[0];
                    const length = responseBuffer.readUInt32BE(1);
                    if (length > MAX_CONNECT_ENVELOPE_BYTES) {
                        fail(new Error(`Sandbox envd stream envelope too large: ${length}`));
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
                    fail(new Error('Sandbox envd stream truncated unexpectedly'));
                    return;
                }
                if (!settled) {
                    fail(new Error('PTY stream ended before process start'));
                    return;
                }
                if (result.exitCode === -1) {
                    fail(new Error('PTY stream ended before process end'));
                    return;
                }
                resolveWait(result);
            });
        });
        req.on('error', fail);
        const startTimeout = opts.requestTimeoutMs !== undefined
            ? opts.requestTimeoutMs
            : millisecondsFromOptions(opts, 'timeout');
        if (startTimeout) {
            startTimer = setTimeout(() => {
                fail(new Error('PTY stream start timed out'));
                req.destroy();
            }, startTimeout);
        }
        req.end(encodeConnectEnvelope(body));
    });
}

function Pty (sandbox) {
    this.sandbox = sandbox;
    this.commands = sandbox.commands;
}

Pty.prototype.create = function (opts) {
    opts = opts || {};
    const envs = Object.assign({}, opts.envs || {});
    if (!envs.TERM) {
        envs.TERM = 'xterm-256color';
    }
    if (!envs.LANG) {
        envs.LANG = 'C.UTF-8';
    }
    if (!envs.LC_ALL) {
        envs.LC_ALL = 'C.UTF-8';
    }

    const body = {
        process: {
            cmd: opts.cmd || '/bin/bash',
            args: opts.args || ['-i', '-l'],
            envs
        },
        pty: {
            size: {
                cols: opts.cols,
                rows: opts.rows
            }
        }
    };
    if (opts.cwd) {
        body.process.cwd = opts.cwd;
    }

    return connectLivePty(this.sandbox, '/process.Process/Start', body, {
        user: opts.user,
        onData: opts.onData,
        requestTimeoutMs: opts.requestTimeoutMs,
        timeoutMs: opts.timeoutMs,
        timeout: opts.timeout
    }, this);
};

Pty.prototype.connect = function (pid, opts) {
    opts = opts || {};
    return connectLivePty(this.sandbox, '/process.Process/Connect', {
        process: {
            selector: { pid }
        }
    }, {
        user: opts.user,
        onData: opts.onData,
        requestTimeoutMs: opts.requestTimeoutMs,
        timeoutMs: opts.timeoutMs,
        timeout: opts.timeout
    }, this);
};

Pty.prototype.sendInput = function (pid, data, opts) {
    return connectRPC(this.sandbox, '/process.Process/SendInput', {
        process: {
            selector: { pid }
        },
        input: {
            pty: Buffer.isBuffer(data) ? data.toString('base64') : Buffer.from(String(data)).toString('base64')
        }
    }, opts).then(() => null);
};

Pty.prototype.resize = function (pid, size, opts) {
    return connectRPC(this.sandbox, '/process.Process/Update', {
        process: {
            selector: { pid }
        },
        pty: {
            size
        }
    }, opts).then(() => null);
};

Pty.prototype.kill = function (pid, opts) {
    return connectRPC(this.sandbox, '/process.Process/SendSignal', {
        process: {
            selector: { pid }
        },
        signal: 'SIGNAL_SIGKILL'
    }, opts).then(() => true, err => {
        if ((err.response && err.response.statusCode === 404) || (err.resp && err.resp.statusCode === 404)) {
            return false;
        }
        throw err;
    });
};

exports.Pty = Pty;
