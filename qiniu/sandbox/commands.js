const { connectRPC, connectStreamRPC } = require('./envd');
const { CommandExitError } = require('./errors');

function eventPayload (event) {
    return event.event || event;
}

function bytesToString (value) {
    if (!value) {
        return '';
    }
    if (Buffer.isBuffer(value)) {
        return value.toString();
    }
    if (Array.isArray(value)) {
        return Buffer.from(value).toString();
    }
    if (typeof value === 'string' && isBase64Text(value)) {
        return Buffer.from(value, 'base64').toString();
    }
    return String(value);
}

function isBase64Text (value) {
    if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
        return false;
    }
    const normalized = value.replace(/=+$/, '');
    const decoded = Buffer.from(value, 'base64');
    const encoded = decoded.toString('base64').replace(/=+$/, '');
    if (encoded !== normalized) {
        return false;
    }
    const text = decoded.toString();
    if (!text) {
        return false;
    }
    let printable = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
            printable++;
        }
    }
    return printable / text.length > 0.8;
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
                callbacks.onData(Buffer.isBuffer(pty) ? pty : Buffer.from(Array.isArray(pty) ? pty : bytesToString(pty)));
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
    return opts.requestTimeoutMs || opts.timeoutMs || opts.timeout;
}

function CommandHandle (commands, pid, result, opts) {
    this.commands = commands;
    this.pid = pid;
    this.result = result;
    this.opts = opts || {};
}

CommandHandle.prototype.wait = function () {
    if (this.opts.throwOnError && this.result && this.result.exitCode) {
        return Promise.reject(new CommandExitError(this.result));
    }
    return Promise.resolve(this.result);
};

CommandHandle.prototype.kill = function () {
    return this.commands.kill(this.pid);
};

CommandHandle.prototype.disconnect = function () {
    return Promise.resolve();
};

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

    return connectStreamRPC(this.sandbox, '/process.Process/Start', body, {
        user: opts.user,
        keepalive: true,
        timeout: requestTimeout(opts),
        timeoutMs: requestTimeout(opts),
        requestTimeoutMs: requestTimeout(opts)
    }).then(events => {
        const result = commandResultFromEvents(events, opts);
        return new CommandHandle(this, result.pid, result, opts);
    });
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
    return connectStreamRPC(this.sandbox, '/process.Process/Connect', {
        process: {
            selector: { pid }
        }
    }, {
        user: opts.user,
        keepalive: true,
        timeout: requestTimeout(opts),
        timeoutMs: requestTimeout(opts),
        requestTimeoutMs: requestTimeout(opts)
    }).then(events => {
        const result = commandResultFromEvents(events, opts);
        return new CommandHandle(this, result.pid || pid, result, opts);
    });
};

Commands.prototype.sendStdin = function (pid, data, opts) {
    return connectRPC(this.sandbox, '/process.Process/SendInput', {
        process: {
            selector: { pid }
        },
        input: {
            stdin: typeof data === 'string' ? Buffer.from(data).toString('base64') : data
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
