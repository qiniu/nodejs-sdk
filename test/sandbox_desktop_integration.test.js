const assert = require('assert');
const { qiniu, loadDotEnvIfPresent, sandboxClient } = require('../examples/sandbox_common');
const { rawRequest } = require('../qiniu/sandbox/util');

const enabled = process.env.QINIU_SANDBOX_DESKTOP_INTEGRATION === 'true';

describe('sandbox desktop integration', function () {
    let desktop;
    before(function () {
        if (!enabled) this.skip();
        loadDotEnvIfPresent();
        if (!process.env.QINIU_SANDBOX_API_KEY) throw new Error('QINIU_SANDBOX_API_KEY is required');
    });
    after(function () {
        if (!desktop) return;
        return desktop.stream.stop().then(
            () => desktop.sandbox.kill(),
            err => desktop.sandbox.kill().then(() => { throw err; })
        );
    });

    it('creates a desktop, operates the screen, serves noVNC and stops both stream modes', function () {
        return qiniu.Desktop.create({
            client: sandboxClient(),
            template: process.env.QINIU_SANDBOX_DESKTOP_TEMPLATE || 'desktop',
            timeout: 180,
            network: { allowPublicTraffic: true },
            resolution: { width: 1024, height: 768 },
            pollOptions: { intervalMs: 2000, timeoutMs: 90000 }
        }).then(value => {
            desktop = value;
            return desktop.screenSize();
        }).then(size => {
            assert.deepStrictEqual(size, { width: 1024, height: 768 });
            return desktop.screenshot();
        }).then(png => {
            assert(Buffer.isBuffer(png));
            assert.strictEqual(png.slice(0, 8).toString('hex'), '89504e470d0a1a0a');
            assert.strictEqual(png.readUInt32BE(16), 1024);
            assert.strictEqual(png.readUInt32BE(20), 768);
            console.log('    screen and PNG verified');
            return desktop.moveMouse({ x: 100, y: 100 });
        }).then(() => desktop.cursorPosition()).then(point => {
            assert.deepStrictEqual(point, { x: 100, y: 100 });
            console.log('    initial mouse move verified');
            return desktop.moveMouse(point).then(() => desktop.click('left', point));
        }).then(() => desktop.doubleClick({ x: 100, y: 100 }))
            .then(() => desktop.mouseDown('right'))
            .then(() => desktop.mouseUp('right'))
            .then(() => desktop.drag({ x: 100, y: 100 }, { x: 120, y: 120 }))
            .then(() => desktop.scroll('down', 1))
            .then(() => desktop.launch('xfce4-terminal', '--title', 'Desktop argv acceptance'))
            .then(() => {
                const deadline = Date.now() + 15000;
                function windows () {
                    return desktop.applicationWindows('xfce4-terminal').then(ids => {
                        if (ids.length) return ids;
                        if (Date.now() > deadline) throw new Error('Terminal window did not appear');
                        return desktop.wait(500).then(windows);
                    });
                }
                return windows();
            }).then(ids => desktop.windowTitle(ids[0]))
            .then(title => assert(title.indexOf('Desktop argv acceptance') >= 0))
            .then(() => desktop.activeWindowID())
            .then(id => assert(/^\d+$/.test(id)))
            .then(() => desktop.typeText('echo desktop-integration', { delayMs: 5 }))
            .then(() => desktop.press('enter'))
            .then(() => desktop.open('https://example.com'))
            .then(() => desktop.launch('/bin/sh', '-c', 'printf "%s\\n" "$@" > /tmp/desktop-argv', 'sh', '--new-window', '', 'a\'b $(printf unsafe); x'))
            .then(() => desktop.sandbox.files.read('/tmp/desktop-argv'))
            .then(output => assert.strictEqual(output, '--new-window\n\na\'b $(printf unsafe); x\n'))
            .then(() => desktop.launch('qiniu-desktop-missing-executable').then(
                () => { throw new Error('Missing executable should fail'); },
                err => assert(err instanceof qiniu.DesktopCommandError)
            ))
            .then(() => { console.log('    keyboard, windows and launch argv verified'); return desktop.stream.start(); })
            .then(() => {
                assert(/^[A-Za-z0-9]{16}$/.test(desktop.stream.authKey()));
                assert(desktop.stream.url().indexOf('password=') < 0);
                return rawRequest(desktop.stream.url(), { method: 'GET', dataType: 'text', timeout: 15000 });
            }).then(response => {
                assert(/noVNC/i.test(response.data));
                const competing = new qiniu.Desktop(desktop.sandbox);
                return competing.stream.start({ vncPort: 5902, webPort: 6080 }).then(
                    () => { throw new Error('Occupied web port should fail'); },
                    err => assert(/web port is already in use/.test(err.message))
                ).then(() => rawRequest(desktop.stream.url(), { method: 'GET', dataType: 'text', timeout: 15000 }))
                    .then(active => assert(/noVNC/i.test(active.data)))
                    .then(() => desktop.stream.stop());
            }).then(() => {
                assert.throws(() => desktop.stream.url(), /not running/);
                return desktop.stream.start({ requireAuth: false, vncPort: 5901, webPort: 6081 });
            }).then(() => {
                assert.throws(() => desktop.stream.authKey(), /disabled/);
                return rawRequest(desktop.stream.url({ viewOnly: true, resize: 'remote' }), { method: 'GET', dataType: 'text', timeout: 15000 });
            }).then(response => {
                assert(/noVNC/i.test(response.data));
                return desktop.stream.stop();
            });
    });
    it('does not use another display to satisfy Xfce readiness or hide display errors', function () {
        const other = new qiniu.Desktop(desktop.sandbox, { display: ':91' });
        return desktop.sandbox.commands.run(other._xfceReadyCommand()).then(result => {
            assert.strictEqual(result.exitCode, 1);
            return other.applicationWindows('xfce4-terminal').then(
                () => { throw new Error('An unavailable display must fail'); },
                err => assert(err instanceof qiniu.DesktopCommandError)
            );
        });
    });

    it('keeps the winning stream alive when two wrappers race for one VNC port', function () {
        const streams = [new qiniu.Desktop(desktop.sandbox).stream, new qiniu.Desktop(desktop.sandbox).stream];
        return Promise.all(streams.map((stream, i) => stream.start({ vncPort: 5910, webPort: 6090 + i }).then(
            () => ({ stream, ok: true }),
            error => ({ stream, ok: false, error })
        ))).then(results => {
            const winners = results.filter(result => result.ok);
            assert.strictEqual(winners.length, 1);
            const winner = winners[0].stream;
            return desktop.sandbox.commands.run('kill -0 ' + winner._state.vncPID).then(result => {
                assert.strictEqual(result.exitCode, 0);
                return rawRequest(winner.url(), { method: 'GET', dataType: 'text', timeout: 15000 });
            }).then(response => {
                assert(/noVNC/i.test(response.data));
                return winner.stop();
            });
        });
    });
});
