const crypto = require('crypto');
const { InvalidArgumentError, TimeoutError } = require('./errors');
const { appendQuery, shellQuote } = require('./util');

function DesktopStream (desktop) {
    this.desktop = desktop;
    this._queue = Promise.resolve();
    this._state = null;
}

DesktopStream.prototype._exclusive = function (fn) {
    const result = this._queue.then(fn);
    this._queue = result.catch(() => {});
    return result;
};

function port (value, fallback) {
    value = value === undefined ? fallback : value;
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new InvalidArgumentError('Desktop stream ports must be between 1 and 65535');
    }
    return value;
}

function processMatch (name, flag, value) {
    // The boundary prevents port 5900 from matching another stream on 59001.
    return `[${name[0]}]${name.slice(1)}.*${flag} ${value}([[:space:]]|$)`;
}

function randomKey () {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    while (result.length < 16) {
        const bytes = crypto.randomBytes(16);
        for (let i = 0; i < bytes.length && result.length < 16; i++) {
            if (bytes[i] < 248) result += alphabet[bytes[i] % alphabet.length];
        }
    }
    return result;
}

DesktopStream.prototype._cleanup = function (state) {
    const commands = [];
    if (state.vncStarted) commands.push('pkill -f ' + shellQuote(processMatch('x11vnc', '-rfbport', state.vncPort)));
    if (state.noVNCPID) {
        commands.push('kill ' + shellQuote(state.noVNCPID));
    }
    if (state.passwordFile) commands.push('rm -f ' + shellQuote(state.passwordFile));
    let firstError;
    let chain = Promise.resolve();
    commands.forEach(command => {
        chain = chain.then(() => this.desktop._runRaw(command).then(result => {
            if (result.exitCode !== 1) this.desktop._checkResult('stop stream', result);
        }).catch(err => {
            if (!firstError) firstError = err;
            else {
                firstError.cleanupErrors = firstError.cleanupErrors || [];
                firstError.cleanupErrors.push(err);
            }
        }));
    });
    return chain.then(() => { if (firstError) throw firstError; });
};

DesktopStream.prototype._storePassword = function (state) {
    const desktop = this.desktop;
    const command = 'IFS= read -r password && x11vnc -storepasswd "$password" ' + shellQuote(state.passwordFile);
    return desktop.sandbox.commands.start(command, Object.assign(desktop._commandOptions(), { stdin: true })).then(handle => {
        // Observe completion immediately, including errors while SendInput is in flight.
        const completion = desktop._waitHandle(handle, 10000);
        completion.catch(() => {});
        return desktop.sandbox.commands.sendStdin(handle.pid, state.password + '\n', desktop._commandOptions())
            .then(() => completion)
            .then(result => {
                return desktop._checkResult('store VNC password', result);
            }).then(() => {
                handle.disconnect();
            }, err => {
                handle.disconnect();
                return handle.kill().catch(cleanupError => {
                    err.cleanupError = cleanupError;
                }).then(() => { throw err; });
            });
    });
};

function webListenersCommand (webPort, withPID) {
    // Match the complete local TCP port for both IPv4 and IPv6 listeners.
    return 'set -o pipefail; netstat -ltn' + (withPID ? 'p' : '') +
        ' | awk ' + shellQuote('$1 ~ /^tcp/ && $4 ~ /:' + webPort + '$/ { print ' + (withPID ? '$7' : '$4') + ' }');
}

function ownedListenerCommand (state) {
    return 'listeners=$(' + webListenersCommand(state.webPort, true) + ') || exit $?; ' +
        'test -n "$listeners" || exit 0; ' +
        // eslint-disable-next-line no-template-curly-in-string
        'for listener in $listeners; do owner=${listener%%/*}; ' +
        'while [ "$owner" -gt 1 ] 2>/dev/null; do ' +
        'if [ "$owner" = ' + shellQuote(state.noVNCPID) + ' ]; then echo owned; exit 0; fi; ' +
        'owner=$(ps -o ppid= -p "$owner") || break; owner=$((owner + 0)); ' +
        'done; done; echo foreign';
}

DesktopStream.prototype._startProxy = function (state) {
    const desktop = this.desktop;
    const command = `cd /opt/noVNC/utils && exec ./novnc_proxy --vnc ${shellQuote('localhost:' + state.vncPort)} --listen ${shellQuote(state.webPort)} --web /opt/noVNC > /tmp/novnc.log 2>&1`;
    return desktop.sandbox.commands.start(command, desktop._commandOptions()).then(handle => {
        state.noVNCPID = handle.pid;
        let failure;
        // Keep the process stream attached until its own listener is ready.
        handle.wait().then(result => {
            try {
                desktop._checkResult('start noVNC', result);
                failure = new Error('Desktop noVNC exited before becoming ready');
            } catch (err) { failure = err; }
        }, err => { failure = err; });
        const deadline = Date.now() + 10000;
        const probe = () => {
            if (failure) return Promise.reject(failure);
            return desktop._run('check noVNC listener', ownedListenerCommand(state), Math.max(1, deadline - Date.now())).then(result => {
                if (failure) throw failure;
                const owner = result.stdout.trim();
                if (owner === 'owned') return;
                if (owner) throw new Error('Desktop web port is owned by another process');
                const remaining = deadline - Date.now();
                if (remaining <= 0) throw new TimeoutError('Desktop noVNC readiness timed out');
                return desktop.wait(Math.min(500, remaining)).then(probe);
            });
        };
        return probe().then(() => handle.disconnect(), err => {
            handle.disconnect();
            throw err;
        });
    });
};

DesktopStream.prototype.start = function (opts) {
    opts = Object.assign({}, opts);
    return this._exclusive(() => {
        if (this._state) throw new Error('Desktop stream is already running');
        const state = {
            vncPort: port(opts.vncPort, 5900),
            webPort: port(opts.webPort, 6080),
            requireAuth: opts.requireAuth === undefined ? true : opts.requireAuth
        };
        if (state.vncPort === state.webPort) throw new InvalidArgumentError('Desktop VNC and web ports must differ');
        if (typeof state.requireAuth !== 'boolean') throw new InvalidArgumentError('Desktop requireAuth must be a boolean');
        if (opts.windowID !== undefined && (typeof opts.windowID !== 'string' || !/^(?:[0-9]+|0x[0-9a-fA-F]+)$/.test(opts.windowID))) {
            throw new InvalidArgumentError('Invalid desktop window ID');
        }
        if (!this.desktop.sandbox.getHost(state.webPort)) throw new Error('Desktop stream host is unavailable');
        return this.desktop._runRaw('pgrep -f ' + shellQuote(processMatch('x11vnc', '-rfbport', state.vncPort))).then(result => {
            if (result.exitCode !== 1) {
                this.desktop._checkResult('check stream', result);
                if (result.stdout.trim()) throw new Error('Desktop stream is already running');
            }
            return this.desktop._run('check web port', webListenersCommand(state.webPort, false));
        }).then(result => {
            if (result.stdout.trim()) throw new Error('Desktop web port is already in use');
            let prepare = Promise.resolve();
            if (state.requireAuth) {
                state.password = randomKey();
                // Each stream owns its password file; stopping one must not remove another's.
                state.passwordFile = '/tmp/qiniu-desktop-vnc-' + crypto.randomBytes(16).toString('hex') + '.passwd';
                prepare = this._storePassword(state);
            }
            return prepare.then(() => {
                const auth = state.requireAuth ? '-rfbauth ' + shellQuote(state.passwordFile) : '-nopw';
                let command = `x11vnc -bg -display ${shellQuote(this.desktop.display)} -forever -wait '50' -shared -rfbport ${shellQuote(state.vncPort)} ${auth} 2>/tmp/x11vnc_stderr.log`;
                if (opts.windowID !== undefined) command += ' -id ' + shellQuote(opts.windowID);
                state.vncStarted = true;
                return this.desktop._run('start x11vnc', command);
            }).then(() => this._startProxy(state)).then(() => {
                this._state = state;
            }).catch(err => this._cleanup(state).catch(cleanupError => {
                err.cleanupError = cleanupError;
            }).then(() => { throw err; }));
        });
    });
};

DesktopStream.prototype.stop = function () {
    return this._exclusive(() => {
        const state = this._state;
        if (!state) return;
        this._state = null;
        return this._cleanup(state);
    });
};

DesktopStream.prototype.authKey = function () {
    if (!this._state) throw new Error('Desktop stream is not running');
    if (!this._state.requireAuth) throw new Error('Desktop stream authentication is disabled');
    return this._state.password;
};

DesktopStream.prototype.url = function (opts) {
    if (!this._state) throw new Error('Desktop stream is not running');
    opts = opts || {};
    const resize = opts.resize === undefined ? 'scale' : opts.resize;
    if (['off', 'scale', 'remote'].indexOf(resize) < 0) throw new InvalidArgumentError('Invalid desktop stream resize mode');
    const host = this.desktop.sandbox.getHost(this._state.webPort);
    if (!host) throw new Error('Desktop stream host is unavailable');
    const query = { resize };
    if (opts.autoConnect !== false) query.autoconnect = 'true';
    if (opts.viewOnly) query.view_only = 'true';
    // Only explicit opt-in puts a password in browser history/proxy logs.
    if (opts.authKey) query.password = opts.authKey;
    return 'https://' + host + appendQuery('/vnc.html', query);
};

exports.DesktopStream = DesktopStream;
