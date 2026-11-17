const { qiniu } = require('./sandbox_helpers');

function fixture (respond) {
    const calls = [];
    const handles = [];
    const stdin = [];
    const files = [];
    const sandbox = new qiniu.Sandbox({ info: { sandboxID: 'desktop-1', domain: 'sandbox.test' } });
    sandbox.commands = {
        start: function (cmd, opts) {
            calls.push({ cmd, opts });
            return Promise.resolve().then(() => respond && respond(cmd, opts)).then(result => {
                const handle = {
                    pid: 100 + handles.length,
                    disconnected: false,
                    killed: false,
                    wait: () => Promise.resolve(Object.assign({ exitCode: 0, stdout: '', stderr: '' }, result)),
                    disconnect: function () { this.disconnected = true; },
                    kill: function () { this.killed = true; return Promise.resolve(); }
                };
                handles.push(handle);
                return handle;
            });
        },
        sendStdin: function (pid, data, opts) {
            stdin.push({ pid, data, opts });
            return Promise.resolve();
        }
    };
    sandbox.files = {
        read: function (path, opts) { files.push({ operation: 'read', path, opts }); return Promise.resolve(Buffer.from('png')); },
        remove: function (path) { files.push({ operation: 'remove', path }); return Promise.resolve(); }
    };
    return { desktop: new qiniu.Desktop(sandbox), sandbox, calls, handles, stdin, files };
}

function streamResponse (cmd) {
    if (cmd.indexOf('pgrep -f') === 0) return { exitCode: 1 };
    if (cmd.indexOf('netstat') === 0) return { stdout: 'tcp 0 0 0.0.0.0:6080 LISTEN' };
}

exports.fixture = fixture;
exports.streamResponse = streamResponse;
