const assert = require('assert');
const { qiniu, startServer, closeServer, decodeConnectEnvelope, encodeConnectEnvelope } = require('./sandbox_helpers');
const { shellQuote } = require('../qiniu/sandbox/util');
const { fixture } = require('./sandbox_desktop_helpers');

function rejects (promise, check) {
    return promise.then(() => { throw new Error('Expected rejection'); }, check);
}

describe('sandbox desktop', function () {
    it('wraps the existing sandbox without side effects and validates options', function () {
        const f = fixture();
        assert.strictEqual(f.desktop.sandbox, f.sandbox);
        assert.strictEqual(f.desktop.display, ':0');
        assert.strictEqual(f.calls.length, 0);
        [null, {}].forEach(sb => assert.throws(() => new qiniu.Desktop(sb), /requires a Sandbox/));
        [
            { resolution: { width: 0, height: 100 } }, { resolution: { width: 10.5, height: 10 } },
            { dpi: -1 }, { display: ':0; echo unsafe' }
        ].forEach(opts => assert.throws(() => new qiniu.Desktop(f.sandbox, opts), qiniu.sandbox.InvalidArgumentError));
    });

    it('starts Xvfb and Xfce once across concurrent calls and detaches their handles', function () {
        const f = fixture();
        const desktop = new qiniu.Desktop(f.sandbox, { resolution: { width: 1280, height: 720 }, dpi: 120, display: ':2' });
        return Promise.all([desktop.start(), desktop.start()]).then(() => desktop.start()).then(() => {
            assert.strictEqual(f.calls.length, 4);
            assert.strictEqual(f.calls[0].cmd, 'Xvfb \':2\' -ac -screen 0 \'1280x720x24\' -retro -dpi \'120\' -nolisten tcp');
            assert(f.handles[0].disconnected);
            assert(f.handles[2].disconnected);
            f.calls.forEach(call => assert.strictEqual(call.opts.envs.DISPLAY, ':2'));
        });
    });

    it('allows retry after desktop startup failure', function () {
        let fail = true;
        const f = fixture(() => { if (fail) throw new Error('offline'); });
        return rejects(f.desktop.start(), err => assert.strictEqual(err.message, 'offline')).then(() => {
            fail = false;
            return f.desktop.start();
        });
    });

    it('parses screen, cursor and window queries, including no matching windows', function () {
        const f = fixture(cmd => {
            if (cmd === 'xrandr') return { stdout: 'Screen 0: minimum 1 x 1, current 1024 x 768, maximum 32767 x 32767' };
            if (cmd === 'xdotool getmouselocation') return { stdout: 'x:0 y:12 screen:0 window:42' };
            if (cmd === 'xdotool getwindowfocus') return { stdout: '42\n' };
            if (cmd.indexOf('getwindowname') >= 0) return { stdout: ' Terminal \n' };
            if (cmd.indexOf('missing') >= 0) return { exitCode: 1 };
            return { stdout: '42\n43\n' };
        });
        return Promise.all([
            f.desktop.screenSize(), f.desktop.cursorPosition(), f.desktop.activeWindowID(),
            f.desktop.windowTitle('42'), f.desktop.applicationWindows('terminal'), f.desktop.applicationWindows('missing')
        ]).then(values => assert.deepStrictEqual(values, [{ width: 1024, height: 768 }, { x: 0, y: 12 }, '42', 'Terminal', ['42', '43'], []]));
    });

    it('rejects malformed output and preserves nonzero command results', function () {
        const f = fixture(() => ({ stdout: '1024x768 60.0*' }));
        const failed = fixture(() => ({ exitCode: 2, stderr: 'bad display' }));
        return Promise.all([
            rejects(f.desktop.screenSize(), err => assert(/Cannot parse/.test(err.message))),
            rejects(f.desktop.cursorPosition(), err => assert(/Cannot parse/.test(err.message))),
            rejects(failed.desktop.screenSize(), err => {
                assert(err instanceof qiniu.DesktopCommandError);
                assert(err instanceof qiniu.CommandExitError);
                assert.strictEqual(err.result.exitCode, 2);
                assert.strictEqual(err.operation, 'get screen size');
                assert(/bad display/.test(err.message));
            }),
            rejects(failed.desktop.applicationWindows('term'), err => assert(err instanceof qiniu.DesktopCommandError))
        ]);
    });

    it('serializes composite mouse and keyboard actions without losing origin coordinates', function () {
        const f = fixture();
        return Promise.all([
            f.desktop.drag({ x: 0, y: 0 }, { x: 10, y: 20 }), f.desktop.click('right', { x: 0, y: 0 }),
            f.desktop.doubleClick(), f.desktop.mouseDown('middle'), f.desktop.mouseUp('middle'),
            f.desktop.scroll('up', 3), f.desktop.scroll('down', 2), f.desktop.press('ctrl', 'shift', 'enter')
        ]).then(() => assert.deepStrictEqual(f.calls.map(call => call.cmd), [
            'xdotool mousemove \'0\' \'0\'', 'xdotool mousedown \'1\'', 'xdotool mousemove \'10\' \'20\'', 'xdotool mouseup \'1\'',
            'xdotool mousemove \'0\' \'0\'', 'xdotool click \'3\'', 'xdotool click --repeat \'2\' \'1\'',
            'xdotool mousedown \'2\'', 'xdotool mouseup \'2\'', 'xdotool click --repeat \'3\' \'4\'', 'xdotool click --repeat \'2\' \'5\'',
            'xdotool key \'Control_L+Shift_L+Return\''
        ]));
    });

    it('releases the mouse on failed drag and keeps the action queue usable', function () {
        const f = fixture(cmd => cmd === 'xdotool mousemove \'1\' \'1\'' ? { exitCode: 1 } : undefined);
        const drag = rejects(f.desktop.drag({ x: 0, y: 0 }, { x: 1, y: 1 }), err => assert(err instanceof qiniu.DesktopCommandError));
        return Promise.all([drag, f.desktop.press('esc')]).then(() => {
            assert.strictEqual(f.calls[3].cmd, 'xdotool mouseup \'1\'');
            assert.strictEqual(f.calls[4].cmd, 'xdotool key \'Escape\'');
        });
    });

    it('types Unicode code points in quoted chunks and preserves literal shell syntax', function () {
        const f = fixture();
        return Promise.all([f.desktop.typeText('你😀\'$(id)', { chunkSize: 2, delayMs: 0 }), f.desktop.press('enter')]).then(() => {
            assert.deepStrictEqual(f.calls.map(call => call.cmd), ['你😀', '\'$', '(i', 'd)'].map(chunk => 'xdotool type --delay \'0\' -- ' + shellQuote(chunk)).concat('xdotool key \'Return\''));
            return f.desktop.typeText('text', { chunkSize: 1 });
        }).then(() => assert(f.calls[5].cmd.indexOf('--delay \'75\'') >= 0));
    });

    it('validates all input before sending commands', function () {
        const f = fixture();
        [
            () => f.desktop.moveMouse({ x: -1, y: 0 }), () => f.desktop.click('bad', { x: 1, y: 1 }),
            () => f.desktop.drag({ x: 0, y: 0 }, { x: NaN, y: 1 }), () => f.desktop.scroll('left', 1),
            () => f.desktop.scroll('up', 0), () => f.desktop.press(), () => f.desktop.press('ctrl;c'),
            () => f.desktop.typeText('text', { chunkSize: -1 }), () => f.desktop.typeText('x\0y'),
            () => f.desktop.typeText('text', { delayMs: -1 }), () => f.desktop.open(''),
            () => f.desktop.launch(''), () => f.desktop.windowTitle(''), () => f.desktop.wait(-1)
        ].forEach(fn => assert.throws(fn, qiniu.sandbox.InvalidArgumentError));
        assert.strictEqual(f.calls.length, 0);
    });

    it('launches detached applications with safely quoted arguments', function () {
        const f = fixture();
        const url = 'https://example.com/?q=\'$(id)\'';
        return Promise.all([f.desktop.open(url), f.desktop.launch('firefox-esr', '--new-window', url)]).then(() => {
            assert.strictEqual(f.calls[0].cmd, 'xdg-open ' + shellQuote(url));
            assert.strictEqual(f.calls[1].cmd, 'gtk-launch ' + ['firefox-esr', '--new-window', url].map(shellQuote).join(' '));
            assert(f.handles.every(handle => handle.disconnected));
        });
    });

    it('reads binary screenshots and cleans unique temporary paths on success and failure', function () {
        const f = fixture();
        return Promise.all([f.desktop.screenshot(), f.desktop.screenshot()]).then(values => {
            values.forEach(value => assert(Buffer.isBuffer(value)));
            const reads = f.files.filter(call => call.operation === 'read');
            assert.notStrictEqual(reads[0].path, reads[1].path);
            reads.forEach(call => {
                assert.strictEqual(call.opts.format, 'bytes');
                assert(f.files.some(other => other.operation === 'remove' && other.path === call.path));
            });
            f.sandbox.files.read = () => Promise.reject(new Error('read failed'));
            return rejects(f.desktop.screenshot(), err => assert.strictEqual(err.message, 'read failed'));
        }).then(() => assert.strictEqual(f.files.filter(call => call.operation === 'remove').length, 3));
    });

    it('bounds hanging commands and detaches/kills the handle on timeout', function () {
        const f = fixture();
        let killed = false;
        let disconnected = false;
        const handle = {
            wait: () => new Promise(() => {}),
            kill: () => { killed = true; return Promise.resolve(); },
            disconnect: () => { disconnected = true; }
        };
        return rejects(f.desktop._waitHandle(handle, 5), err => {
            assert(err instanceof qiniu.sandbox.TimeoutError);
            assert(killed && disconnected);
        });
    });

    it('creates a desktop through the actual API and envd command transport', function () {
        let server;
        let createdBody;
        let commands = 0;
        const envs = { KEEP: 'value' };
        return startServer((req, res) => {
            if (req.url === '/sandboxes' && req.method === 'POST') {
                createdBody = JSON.parse(req.body);
                res.end(JSON.stringify({ sandboxID: 'desktop-1', domain: 'sandbox.test', envdAccessToken: 'token' }));
            } else if (req.url === '/sandboxes/desktop-1') {
                res.end(JSON.stringify({ sandboxID: 'desktop-1', state: 'running', domain: 'sandbox.test', envdAccessToken: 'token' }));
            } else if (req.url === '/process.Process/Start') {
                const body = decodeConnectEnvelope(req.rawBody);
                assert.strictEqual(body.process.envs.DISPLAY, ':3');
                commands++;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([encodeConnectEnvelope({ event: { start: { pid: commands } } }), encodeConnectEnvelope({ event: { end: { exitCode: 0 } } })]));
            } else { res.statusCode = 404; res.end('{}'); }
        }).then(local => {
            server = local.server;
            const client = new qiniu.SandboxClient({ endpoint: local.endpoint, apiKey: 'test' });
            const original = qiniu.Sandbox.prototype.envdUrl;
            qiniu.Sandbox.prototype.envdUrl = () => local.endpoint;
            return client.createDesktop({ envs, display: ':3', pollOptions: { intervalMs: 1, timeoutMs: 1000 } })
                .then(desktop => {
                    assert(desktop instanceof qiniu.Desktop);
                    assert.strictEqual(desktop.sandbox.sandboxId, 'desktop-1');
                    assert.strictEqual(createdBody.templateID, 'desktop');
                    assert.deepStrictEqual(createdBody.envVars, { KEEP: 'value', DISPLAY: ':3' });
                    assert.deepStrictEqual(envs, { KEEP: 'value' });
                    assert.strictEqual(commands, 4);
                }).then(() => { qiniu.Sandbox.prototype.envdUrl = original; }, err => { qiniu.Sandbox.prototype.envdUrl = original; throw err; });
        }).then(() => closeServer(server), err => closeServer(server).then(() => { throw err; }));
    });

    it('kills a created sandbox on readiness failure and retains cleanup errors', function () {
        let deleted = 0;
        const client = {
            createSandbox: () => Promise.resolve({ sandboxID: 'created' }),
            getSandbox: () => Promise.reject(new TypeError('readiness failed')),
            deleteSandbox: id => { assert.strictEqual(id, 'created'); deleted++; return Promise.reject(new Error('cleanup failed')); }
        };
        return rejects(qiniu.Desktop.create({ client }), err => {
            assert.strictEqual(err.message, 'readiness failed');
            assert.strictEqual(err.cleanupError.message, 'cleanup failed');
            assert.strictEqual(deleted, 1);
        });
    });
    it('destroys the sandbox if desktop initialization fails after readiness', function () {
        const start = qiniu.Desktop.prototype.start;
        let deleted = 0;
        let params;
        const client = {
            createSandbox: opts => { params = opts; return Promise.resolve({ sandboxID: 'created', envdAccessToken: 'token' }); },
            getSandbox: () => Promise.resolve({ sandboxID: 'created', state: 'running', envdAccessToken: 'token' }),
            deleteSandbox: () => { deleted++; return Promise.resolve(); }
        };
        qiniu.Desktop.prototype.start = () => Promise.reject(new Error('Xfce failed'));
        return rejects(qiniu.Desktop.create('custom-desktop', { client, envVars: { KEEP: 'yes' } }), err => {
            assert.strictEqual(err.message, 'Xfce failed');
            assert.strictEqual(deleted, 1);
            assert.strictEqual(params.templateID, 'custom-desktop');
            assert.deepStrictEqual(params.envs, { KEEP: 'yes', DISPLAY: ':0' });
        }).then(() => { qiniu.Desktop.prototype.start = start; }, err => { qiniu.Desktop.prototype.start = start; throw err; });
    });
});
