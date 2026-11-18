const assert = require('assert');
const { qiniu, parseUrl } = require('./sandbox_helpers');
const { fixture, streamResponse } = require('./sandbox_desktop_helpers');

function rejects (promise, check) {
    return promise.then(() => { throw new Error('Expected rejection'); }, check);
}

describe('sandbox desktop stream', function () {
    it('uses a random password over stdin and omits credentials from the default URL', function () {
        const f = fixture(streamResponse);
        return f.desktop.stream.start().then(() => {
            const key = f.desktop.stream.authKey();
            assert(/^[A-Za-z0-9]{16}$/.test(key));
            assert.strictEqual(f.stdin[0].data, key + '\n');
            assert(f.calls.every(call => call.cmd.indexOf(key) < 0));
            assert(f.calls.some(call => call.cmd.indexOf('-rfbauth') >= 0));
            const helper = f.calls.find(call => call.cmd.indexOf('storepasswd') >= 0);
            assert(helper.opts.stdin);
            const url = parseUrl(f.desktop.stream.url());
            assert.strictEqual(url.hostname, '6080-desktop-1.sandbox.test');
            assert.strictEqual(url.pathname, '/vnc.html');
            assert.strictEqual(url.searchParams.get('password'), null);
            assert.strictEqual(url.searchParams.get('autoconnect'), 'true');
            assert.strictEqual(url.searchParams.get('resize'), 'scale');
            const explicit = parseUrl(f.desktop.stream.url({ authKey: 'p&=# value', viewOnly: true, autoConnect: false, resize: 'remote' }));
            assert.strictEqual(explicit.searchParams.get('password'), 'p&=# value');
            assert.strictEqual(explicit.searchParams.get('view_only'), 'true');
            assert.strictEqual(explicit.searchParams.get('autoconnect'), null);
            assert.strictEqual(explicit.searchParams.get('resize'), 'remote');
            assert.throws(() => f.desktop.stream.url({ resize: 'bad' }), qiniu.sandbox.InvalidArgumentError);
            return f.desktop.stream.stop();
        }).then(() => {
            assert.throws(() => f.desktop.stream.authKey(), /not running/);
            assert.throws(() => f.desktop.stream.url(), /not running/);
            assert(!f.calls.some(call => call.cmd.indexOf('pkill') >= 0));
            assert(f.calls.some(call => call.cmd.indexOf('kill ') === 0));
            assert(f.calls.some(call => call.cmd.indexOf('rm -f') === 0));
            const count = f.calls.length;
            return f.desktop.stream.stop().then(() => assert.strictEqual(f.calls.length, count));
        });
    });

    it('supports explicit no-auth, custom ports and single-window streams', function () {
        const f = fixture(streamResponse);
        return f.desktop.stream.start({ requireAuth: false, vncPort: 5901, webPort: 6081, windowID: '0x10' }).then(() => {
            assert.throws(() => f.desktop.stream.authKey(), /disabled/);
            assert.strictEqual(f.stdin.length, 0);
            assert(f.calls.some(call => call.cmd.indexOf('-rfbport \'5901\' -nopw') >= 0 && call.cmd.indexOf('-id \'0x10\'') >= 0));
            assert(f.desktop.stream.url().indexOf('https://6081-') === 0);
            return f.desktop.stream.stop();
        });
    });

    it('serializes concurrent starts and stops', function () {
        const f = fixture(streamResponse);
        return Promise.all([
            f.desktop.stream.start(),
            rejects(f.desktop.stream.start(), err => assert(/already running/.test(err.message))),
            f.desktop.stream.stop()
        ]).then(() => {
            assert.strictEqual(f.calls.filter(call => call.cmd.indexOf('exec x11vnc') === 0).length, 1);
            assert.throws(() => f.desktop.stream.url(), /not running/);
        });
    });

    it('validates stream options and host before any remote side effects', function () {
        const f = fixture(streamResponse);
        return Promise.all([
            { vncPort: 0 }, { webPort: 65536 }, { vncPort: 6080 }, { vncPort: 2.5 },
            { requireAuth: 'false' }, { windowID: '1;touch /tmp/pwn' }
        ].map(opts => rejects(f.desktop.stream.start(opts), err => assert(err instanceof qiniu.sandbox.InvalidArgumentError)))).then(() => {
            assert.strictEqual(f.calls.length, 0);
            f.sandbox.domain = '';
            return rejects(f.desktop.stream.start(), err => assert(/host/.test(err.message)));
        });
    });

    it('leaves existing remote streams untouched', function () {
        const f = fixture(() => ({ stdout: '123\n' }));
        return rejects(f.desktop.stream.start(), err => assert(/already running/.test(err.message))).then(() => {
            assert.strictEqual(f.calls.length, 1);
            assert.strictEqual(f.stdin.length, 0);
        });
    });

    it('propagates unexpected process-check failures instead of starting a second stream', function () {
        const f = fixture(() => ({ exitCode: 2, stderr: 'pgrep failed' }));
        return rejects(f.desktop.stream.start(), err => assert(err instanceof qiniu.DesktopCommandError))
            .then(() => assert.strictEqual(f.calls.length, 1));
    });

    it('cleans partially started streams and preserves the primary error', function () {
        const f = fixture(cmd => {
            if (cmd.indexOf('novnc_proxy --vnc') >= 0) throw new Error('noVNC failed');
            if (cmd.indexOf('kill ') === 0) return { exitCode: 2, stderr: 'cleanup failed' };
            return streamResponse(cmd);
        });
        return rejects(f.desktop.stream.start(), err => {
            assert.strictEqual(err.message, 'noVNC failed');
            assert(err.cleanupError instanceof qiniu.DesktopCommandError);
            assert(f.calls.some(call => call.cmd.indexOf('rm -f') === 0));
            assert.throws(() => f.desktop.stream.authKey(), /not running/);
        });
    });

    it('cleans the password and terminates the helper when stdin delivery fails', function () {
        const f = fixture(streamResponse);
        f.sandbox.commands.sendStdin = () => Promise.reject(new Error('stdin failed'));
        return rejects(f.desktop.stream.start(), err => {
            assert.strictEqual(err.message, 'stdin failed');
            const helper = f.handles[2];
            assert(helper.killed && helper.disconnected);
            assert(f.calls.some(call => call.cmd.indexOf('rm -f') === 0));
            assert(!f.calls.some(call => call.cmd.indexOf('exec x11vnc') === 0));
        });
    });

    it('rolls back all started processes after a readiness failure and supports retry', function () {
        let fail = true;
        const f = fixture(cmd => {
            if (cmd.indexOf('listeners=$(') === 0 && fail) throw new Error('probe offline');
            return streamResponse(cmd);
        });
        return rejects(f.desktop.stream.start(), err => assert.strictEqual(err.message, 'probe offline')).then(() => {
            assert(f.calls.some(call => call.cmd.indexOf('kill ') === 0));
            assert(f.calls.some(call => call.cmd.indexOf('rm -f') === 0));
            fail = false;
            return f.desktop.stream.start();
        }).then(() => f.desktop.stream.stop());
    });

    it('clears credentials even when stop cleanup fails and attempts all cleanup steps', function () {
        const f = fixture(cmd => {
            if (cmd.indexOf('kill ') === 0) throw new Error('stop failed');
            return streamResponse(cmd);
        });
        return f.desktop.stream.start().then(() => rejects(f.desktop.stream.stop(), err => {
            assert.strictEqual(err.message, 'stop failed');
            assert(f.calls.some(call => call.cmd.indexOf('kill ') === 0));
            assert(f.calls.some(call => call.cmd.indexOf('rm -f') === 0));
            assert.throws(() => f.desktop.stream.authKey(), /not running/);
            assert.throws(() => f.desktop.stream.url(), /not running/);
        }));
    });
    it('disconnects a failing password helper and removes its temporary file', function () {
        const f = fixture(cmd => cmd.indexOf('storepasswd') >= 0 ? { exitCode: 2, stderr: 'cannot store password' } : streamResponse(cmd));
        return rejects(f.desktop.stream.start(), err => {
            assert(err instanceof qiniu.DesktopCommandError);
            assert(f.handles[2].disconnected);
            assert(f.calls.some(call => call.cmd.indexOf('rm -f') === 0));
        });
    });
    it('rejects occupied web ports before creating passwords or starting processes', function () {
        const f = fixture(cmd => cmd.indexOf('set -o pipefail; netstat -ltn ') === 0 ? { stdout: ':::6080\n' } : streamResponse(cmd));
        return rejects(f.desktop.stream.start({ vncPort: 5901 }), err => {
            assert(/web port is already in use/.test(err.message));
            assert.strictEqual(f.calls.length, 2);
            assert.strictEqual(f.stdin.length, 0);
            assert(!f.calls.some(call => /pkill|rm -f/.test(call.cmd)));
            assert.throws(() => f.desktop.stream.url(), /not running/);
        });
    });

    it('rejects a competing listener that appears after the preflight check', function () {
        const f = fixture(cmd => cmd.indexOf('listeners=$(') === 0 ? { stdout: 'foreign\n' } : streamResponse(cmd));
        return rejects(f.desktop.stream.start(), err => {
            assert(/owned by another process/.test(err.message));
            assert(f.calls.some(call => call.cmd.indexOf('kill ') === 0));
            assert(!f.calls.some(call => call.cmd.indexOf('pkill') === 0 && call.cmd.indexOf('novnc_proxy') >= 0));
            assert.throws(() => f.desktop.stream.url(), /not running/);
        });
    });

    it('reports proxy exit even if a listener appears ready', function () {
        const f = fixture(cmd => cmd.indexOf('exec ./novnc_proxy') >= 0 ? { exitCode: 1, stderr: 'address in use' } : streamResponse(cmd));
        return rejects(f.desktop.stream.start(), err => {
            assert(err instanceof qiniu.DesktopCommandError);
            assert.strictEqual(err.operation, 'start noVNC');
            assert.throws(() => f.desktop.stream.authKey(), /not running/);
        });
    });

    it('fails when the proxy exits successfully without serving a listener', function () {
        const f = fixture(cmd => cmd.indexOf('exec ./novnc_proxy') >= 0 ? { exitCode: 0 } : streamResponse(cmd));
        return rejects(f.desktop.stream.start(), err => assert(/exited before becoming ready/.test(err.message)));
    });
    it('cleans only the losing attempt PID after concurrent VNC binds', function () {
        const winner = fixture(streamResponse);
        const loser = fixture(cmd => cmd.indexOf('exec x11vnc') === 0 ? { exitCode: 1, stderr: 'bind failed' } : streamResponse(cmd));
        const start = loser.sandbox.commands.start;
        loser.sandbox.commands.start = (cmd, opts) => start(cmd, opts).then(handle => {
            handle.pid += 1000;
            return handle;
        });
        return Promise.all([
            winner.desktop.stream.start(),
            rejects(loser.desktop.stream.start(), err => assert(err instanceof qiniu.DesktopCommandError))
        ]).then(() => {
            const winnerPID = winner.desktop.stream._state.vncPID;
            const attempt = loser.calls.findIndex(call => call.cmd.indexOf('exec x11vnc') === 0);
            const loserPID = loser.handles[attempt].pid;
            assert(loser.calls.some(call => call.cmd.indexOf('kill ' + '\'' + loserPID + '\'') === 0));
            assert(!loser.calls.some(call => call.cmd.indexOf('kill ' + '\'' + winnerPID + '\'') === 0));
            assert(!loser.calls.some(call => call.cmd.indexOf('pkill') >= 0));
            assert(winner.desktop.stream.url());
            return winner.desktop.stream.stop();
        });
    });

    it('reports status-one kill and password-removal failures while trying every cleanup step', function () {
        const f = fixture(cmd => /^(kill |rm -f )/.test(cmd) ? { exitCode: 1, stderr: 'permission denied' } : streamResponse(cmd));
        return f.desktop.stream.start().then(() => rejects(f.desktop.stream.stop(), err => {
            assert(err instanceof qiniu.DesktopCommandError);
            assert.strictEqual(err.result.exitCode, 1);
            assert.strictEqual(err.cleanupErrors.length, 2);
            assert(f.calls.filter(call => call.cmd.indexOf('kill ') === 0).every(call => /\|\| test ! -d/.test(call.cmd)));
            assert.throws(() => f.desktop.stream.authKey(), /not running/);
        }));
    });

    it('retains status-one cleanup errors during startup rollback', function () {
        const f = fixture(cmd => {
            if (cmd.indexOf('exec x11vnc') === 0) return { exitCode: 2, stderr: 'bind failed' };
            if (cmd.indexOf('rm -f') === 0) return { exitCode: 1, stderr: 'read-only filesystem' };
            return streamResponse(cmd);
        });
        return rejects(f.desktop.stream.start(), err => {
            assert.strictEqual(err.result.exitCode, 2);
            assert.strictEqual(err.cleanupError.result.exitCode, 1);
            assert.strictEqual(err.cleanupError.result.stderr, 'read-only filesystem');
        });
    });
});
