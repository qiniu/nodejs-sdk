const { connectEndStreamError, connectRPC, envdHeaders, MAX_CONNECT_ENVELOPE_BYTES } = require('./envd');
const { CommandExitError } = require('./errors');
const { agentFromClient, millisecondsFromOptions, parseJSON, parseRequestUrl } = require('./util');
const http = require('http');
const https = require('https');

function eventPayload (event) {
    return event.event || event;
}

function bytesToString (value) {
    return bytesToBuffer(value).toString();
}

function bytesToBuffer (value) {
    if (!value) {
        return Buffer.alloc(0);
    }
    if (Buffer.isBuffer(value)) {
        return value;
    }
    if (Array.isArray(value)) {
        return Buffer.from(value);
    }
    if (typeof value === 'string') {
        return Buffer.from(value, 'base64');
    }
    return Buffer.from(String(value));
}

function commandResultFromEvents (events, callbacks) {
    callbacks = callbacks || {};
    let pid = 0;
    let stdout = '';
    let stderr = '';
    let exitCode = -1;
    let error = '';

    events.forEach(raw => {
        const event = eventPayload(raw);
        const start = event.start || (event.event && event.event.start);
        const data = event.data || (event.event && event.event.data);
        const end = event.end || (event.event && event.event.end);
        if (start) {
            pid = start.pid || pid;
        }
        if (data) {
            const out = data.stdout !== undefined ? bytesToString(data.stdout) : '';
            const err = data.stderr !== undefined ? bytesToString(data.stderr) : '';
            const pty = data.pty !== undefined ? data.pty : undefined;
            if (out) {
                stdout += out;
                if (callbacks.onStdout) {
                    callbacks.onStdout(out);
                }
            }
            if (err) {
                stderr += err;
                if (callbacks.onStderr) {
                    callbacks.onStderr(err);
                }
            }
            if (pty !== undefined && callbacks.onData) {
                callbacks.onData(bytesToBuffer(pty));
            }
        }
        if (end) {
            exitCode = end.exitCode === undefined ? 0 : end.exitCode;
            error = end.error || '';
        }
    });

    return { pid, exitCode, stdout, stderr, error };
}

function requestTimeout (opts) {
    opts = opts || {};
    return opts.requestTimeoutMs !== undefined
        ? opts.requestTimeoutMs
        : millisecondsFromOptions(opts, 'timeout');
}

function encodeConnectEnvelope (message) {
    const payload = Buffer.from(JSON.stringify(message || {}));
    const header = Buffer.alloc(5);
    header[0] = 0;
    header.writeUInt32BE(payload.length, 1);
    return Buffer.concat([header, payload]);
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

function CommandHandle (commands, pid, result, opts, request, waitPromise) {
    this.commands = commands;
    this.pid = pid;
    this.result = result;
    this.opts = opts || {};
    this._request = request;
    this._waitPromise = waitPromise;
    this.stdout = result && result.stdout ? result.stdout : '';
    this.stderr = result && result.stderr ? result.stderr : '';
}

CommandHandle.prototype.wait = function () {
    const finish = result => {
        if (this.opts.throwOnError && result && result.exitCode) {
            throw new CommandExitError(result);
        }
        return result;
    };
    if (this._waitPromise) {
        return this._waitPromise.then(finish);
    }
    return Promise.resolve(this.result).then(finish);
};

CommandHandle.prototype.kill = function () {
    return this.commands.kill(this.pid, {
        user: this.opts.user,
        requestTimeoutMs: this.opts.requestTimeoutMs,
        timeoutMs: this.opts.timeoutMs,
        timeout: this.opts.timeout
    });
};

CommandHandle.prototype.disconnect = function () {
    if (this._request) {
        this._request.destroy();
        this._request = null;
    }
    return Promise.resolve();
};

function connectLiveCommand (commands, procedure, body, opts, fallbackPid) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
        const target = parseRequestUrl(commands.sandbox.envdUrl() + procedure);
        const transport = target.protocol === 'https:' ? https : http;
        const headers = Object.assign({
            'Content-Type': 'application/connect+json',
            'Keepalive-Ping-Interval': '50'
        }, envdHeaders(commands.sandbox, opts.user));
        const req = transport.request({
            method: 'POST',
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port,
            path: target.path,
            headers,
            agent: agentFromClient(commands.sandbox.client, target.protocol)
        });

        let settled = false;
        let handle;
        let responseBuffer = Buffer.alloc(0);
        let responseOffset = 0;
        const jsonChunks = [];
        let isConnectStream = true;
        let result = {
            pid: fallbackPid || 0,
            exitCode: -1,
            stdout: '',
            stderr: '',
            error: ''
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
            if (!settled) {
                settled = true;
                reject(err);
            }
            rejectWait(err);
        }

        function ensureHandle (pid) {
            if (!handle) {
                cleanupStartTimer();
                result.pid = pid || result.pid;
                handle = new CommandHandle(commands, result.pid, null, opts, req, waitPromise);
                settled = true;
                resolve(handle);
            }
        }

        function appendData (data) {
            if (data.stdout !== undefined) {
                const out = bytesToString(data.stdout);
                result.stdout += out;
                if (handle) {
                    handle.stdout += out;
                }
                if (out && opts.onStdout) {
                    opts.onStdout(out);
                }
            }
            if (data.stderr !== undefined) {
                const err = bytesToString(data.stderr);
                result.stderr += err;
                if (handle) {
                    handle.stderr += err;
                }
                if (err && opts.onStderr) {
                    opts.onStderr(err);
                }
            }
            if (data.pty !== undefined && opts.onData) {
                opts.onData(bytesToBuffer(data.pty));
            }
        }

        function finish (end) {
            result.exitCode = end && end.exitCode !== undefined ? end.exitCode : 0;
            result.error = end && end.error ? end.error : '';
            if (handle) {
                handle.result = result;
            }
            resolveWait(result);
        }

        function handleMessage (message) {
            const event = eventPayload(message);
            if (event.start) {
                ensureHandle(event.start.pid);
            }
            if (event.data) {
                appendData(event.data);
            }
            if (event.end) {
                finish(event.end);
            }
        }

        req.on('response', res => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                fail(new Error(`Sandbox envd request failed with status ${res.statusCode}`));
                res.resume();
                return;
            }
            const contentType = (res.headers && res.headers['content-type']) || '';
            isConnectStream = contentType.indexOf('application/connect+json') >= 0;
            if (!isConnectStream) {
                cleanupStartTimer();
            }
            res.on('data', chunk => {
                if (!isConnectStream) {
                    jsonChunks.push(chunk);
                    return;
                }
                responseBuffer = responseOffset < responseBuffer.length
                    ? Buffer.concat([responseBuffer.slice(responseOffset), chunk])
                    : chunk;
                responseOffset = 0;
                while (responseBuffer.length - responseOffset >= 5) {
                    const flags = responseBuffer[responseOffset];
                    const length = responseBuffer.readUInt32BE(responseOffset + 1);
                    if (length > MAX_CONNECT_ENVELOPE_BYTES) {
                        fail(new Error(`Sandbox envd stream envelope too large: ${length}`));
                        req.destroy();
                        return;
                    }
                    if (responseBuffer.length - responseOffset < 5 + length) {
                        break;
                    }
                    const payload = responseBuffer.toString('utf8', responseOffset + 5, responseOffset + 5 + length);
                    responseOffset += 5 + length;
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
                if (responseBuffer.length - responseOffset > 0) {
                    fail(new Error('Sandbox envd stream truncated unexpectedly'));
                    return;
                }
                if (!isConnectStream) {
                    let events;
                    try {
                        events = eventListFromResponse(parseJSON(Buffer.concat(jsonChunks)));
                    } catch (err) {
                        fail(err);
                        return;
                    }
                    result = commandResultFromEvents(events, opts);
                    if (!result.pid && fallbackPid) {
                        result.pid = fallbackPid;
                    }
                    handle = new CommandHandle(commands, result.pid, result, opts);
                    settled = true;
                    resolve(handle);
                    resolveWait(result);
                    return;
                }
                if (!settled) {
                    fail(new Error('Command stream ended before process start'));
                    return;
                }
                if (result.exitCode === -1) {
                    fail(new Error('Command stream ended before process end'));
                }
            });
        });
        req.on('error', fail);
        const startTimeout = requestTimeout(opts);
        if (startTimeout) {
            startTimer = setTimeout(() => {
                fail(new Error('Command stream start timed out'));
                req.destroy();
            }, startTimeout);
        }
        req.end(encodeConnectEnvelope(body));
    });
}

function Commands (sandbox) {
    this.sandbox = sandbox;
}

Commands.prototype.run = function (cmd, opts) {
    opts = opts || {};
    return this.start(cmd, opts).then(handle => opts.background ? handle : handle.wait());
};

Commands.prototype.start = function (cmd, opts) {
    opts = opts || {};
    const body = {
        process: {
            cmd: '/bin/bash',
            args: ['-l', '-c', cmd]
        },
        stdin: opts.stdin || false
    };
    if (opts.cwd) {
        body.process.cwd = opts.cwd;
    }
    if (opts.envs) {
        body.process.envs = opts.envs;
    }
    if (opts.tag) {
        body.tag = opts.tag;
    }

    return connectLiveCommand(this, '/process.Process/Start', body, Object.assign({}, opts, {
        requestTimeoutMs: requestTimeout(opts)
    }));
};

Commands.prototype.list = function (opts) {
    return connectRPC(this.sandbox, '/process.Process/List', {}, opts).then(data => {
        return (data.processes || []).map(p => ({
            pid: p.pid,
            tag: p.tag,
            cmd: p.config && p.config.cmd,
            args: p.config && p.config.args,
            envs: p.config && p.config.envs,
            cwd: p.config && p.config.cwd
        }));
    });
};

Commands.prototype.connect = function (pid, opts) {
    opts = opts || {};
    return connectLiveCommand(this, '/process.Process/Connect', {
        process: {
            selector: { pid }
        }
    }, Object.assign({}, opts, {
        requestTimeoutMs: requestTimeout(opts)
    }), pid);
};

Commands.prototype.sendStdin = function (pid, data, opts) {
    const stdin = Buffer.isBuffer(data) ? data.toString('base64') : Buffer.from(String(data)).toString('base64');
    return connectRPC(this.sandbox, '/process.Process/SendInput', {
        process: {
            selector: { pid }
        },
        input: {
            stdin
        }
    }, opts).then(() => null);
};

Commands.prototype.closeStdin = function (pid, opts) {
    return connectRPC(this.sandbox, '/process.Process/CloseStdin', {
        process: {
            selector: { pid }
        }
    }, opts).then(() => null);
};

Commands.prototype.kill = function (pid, opts) {
    return connectRPC(this.sandbox, '/process.Process/SendSignal', {
        process: {
            selector: { pid }
        },
        signal: 'SIGNAL_SIGKILL'
    }, opts).then(() => null);
};

exports.Commands = Commands;
exports.CommandHandle = CommandHandle;
exports.commandResultFromEvents = commandResultFromEvents;
