const crypto = require('crypto');
const { Sandbox } = require('./sandbox');
const { SandboxClient } = require('./client');
const { DesktopCommandError, InvalidArgumentError, TimeoutError } = require('./errors');
const { shellQuote } = require('./util');
const { DesktopStream } = require('./desktop_stream');

const DEFAULT_DESKTOP_TEMPLATE = 'desktop';

function integer (value, name, min, max) {
    if (!Number.isSafeInteger(value) || value < min || (max !== undefined && value > max)) {
        throw new InvalidArgumentError(`Invalid desktop ${name}`);
    }
    return value;
}

function text (value, name) {
    if (typeof value !== 'string' || !value || value.indexOf('\0') >= 0) {
        throw new InvalidArgumentError(`Invalid desktop ${name}`);
    }
    return value;
}

function normalizeOptions (opts) {
    opts = opts || {};
    const resolution = opts.resolution || { width: 1024, height: 768 };
    const display = opts.display === undefined ? ':0' : opts.display;
    if (typeof display !== 'string' || !/^[A-Za-z0-9_.-]*:[0-9]+(?:\.[0-9]+)?$/.test(display)) {
        throw new InvalidArgumentError('Invalid desktop display');
    }
    return {
        resolution: {
            width: integer(resolution.width, 'width', 1),
            height: integer(resolution.height, 'height', 1)
        },
        dpi: integer(opts.dpi === undefined ? 96 : opts.dpi, 'DPI', 1),
        display
    };
}

function Desktop (sandbox, opts) {
    if (!sandbox || !sandbox.commands || !sandbox.files) {
        throw new InvalidArgumentError('Desktop requires a Sandbox');
    }
    this.sandbox = sandbox;
    this._options = normalizeOptions(opts);
    this._actions = Promise.resolve();
    this._started = false;
    this._starting = null;
    this.stream = new DesktopStream(this);
}

Object.defineProperty(Desktop.prototype, 'display', {
    get: function () { return this._options.display; }
});

Desktop.create = function (templateOrOpts, maybeOpts) {
    const opts = typeof templateOrOpts === 'string'
        ? Object.assign({}, maybeOpts, { templateID: templateOrOpts })
        : Object.assign({}, templateOrOpts);
    const desktopOptions = normalizeOptions(opts);
    const client = opts.client || new SandboxClient(Object.assign({}, opts, {
        // Sandbox TTL and HTTP timeout use different units and lifetimes.
        timeout: opts.requestTimeoutMs
    }));
    opts.templateID = opts.templateID || opts.template || DEFAULT_DESKTOP_TEMPLATE;
    opts.envs = Object.assign({}, opts.envs || opts.envVars, { DISPLAY: desktopOptions.display });
    // Retain the sandbox ID before token refresh/readiness, so every later failure can clean up.
    return client.createSandbox(opts).then(info => {
        const sandbox = new Sandbox({ client, info });
        return sandbox.waitForReady(opts.pollOptions)
            .then(() => sandbox.refreshEnvdTokenIfNeeded())
            .then(() => {
                const desktop = new Desktop(sandbox, desktopOptions);
                return desktop.start().then(() => desktop);
            }).catch(err => sandbox.kill().catch(cleanupError => {
                err.cleanupError = cleanupError;
            }).then(() => { throw err; }));
    });
};

Desktop.prototype._commandOptions = function (timeoutMs) {
    return { envs: { DISPLAY: this.display }, requestTimeoutMs: timeoutMs || 10000 };
};

// Commands.start resolves with the PID; observe early failure before detaching.
Desktop.prototype._startProcess = function (command, operation) {
    return this.sandbox.commands.start(command, this._commandOptions()).then(handle => {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 250);
            handle.wait().then(result => {
                clearTimeout(timer);
                try {
                    this._checkResult(operation || 'start process', result);
                    resolve();
                } catch (err) { reject(err); }
            }, err => { clearTimeout(timer); reject(err); });
        }).then(() => {
            handle.disconnect();
            return handle.pid;
        }, err => {
            handle.disconnect();
            throw err;
        });
    });
};

Desktop.prototype._waitHandle = function (handle, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            // Settle first: disconnect can resolve the underlying wait promise.
            reject(new TimeoutError('Desktop command timed out'));
            handle.disconnect();
            handle.kill().catch(() => {});
        }, timeoutMs);
        handle.wait().then(result => {
            clearTimeout(timer);
            resolve(result);
        }, err => {
            clearTimeout(timer);
            reject(err);
        });
    });
};

Desktop.prototype._runRaw = function (command, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    const deadline = Date.now() + timeoutMs;
    return this.sandbox.commands.start(command, this._commandOptions(timeoutMs))
        .then(handle => this._waitHandle(handle, Math.max(1, deadline - Date.now())));
};

Desktop.prototype._checkResult = function (operation, result) {
    if (result.exitCode !== 0) {
        throw new DesktopCommandError(operation, result);
    }
    return result;
};

Desktop.prototype._run = function (operation, command, timeoutMs) {
    return this._runRaw(command, timeoutMs).then(result => this._checkResult(operation, result)).catch(err => {
        if (err instanceof TimeoutError) err.message = `Desktop ${operation}: ${err.message}`;
        throw err;
    });
};

Desktop.prototype._waitUntil = function (command, timeoutMs, needsOutput) {
    const deadline = Date.now() + timeoutMs;
    const probe = () => this._runRaw(command, Math.max(1, deadline - Date.now())).then(result => {
        if (result.exitCode === 0 && (!needsOutput || result.stdout.trim())) {
            return;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            throw new TimeoutError('Desktop readiness timed out');
        }
        return this.wait(Math.min(500, remaining)).then(probe);
    });
    return probe();
};

Desktop.prototype._xfceReadyCommand = function () {
    // Xfce may normalize :0 to :0.0; other screens/displays must not satisfy readiness.
    const displays = [this.display];
    if (/:[0-9]+$/.test(this.display)) displays.push(this.display + '.0');
    else if (/\.0$/.test(this.display)) displays.push(this.display.slice(0, -2));
    const patterns = displays.map(display => '-e ' + shellQuote('DISPLAY=' + display)).join(' ');
    return 'for name in xfce4-session xfwm4 xfdesktop; do found=; ' +
        'for pid in $(pgrep -x "$name"); do ' +
        'if tr \'\\0\' \'\\n\' < /proc/$pid/environ 2>/dev/null | grep -Fx ' + patterns + ' >/dev/null; ' +
        'then found=1; break; fi; done; test -n "$found" || exit 1; done';
};

Desktop.prototype.start = function () {
    if (this._started) return Promise.resolve();
    if (this._starting) return this._starting;
    const opts = this._options;
    const resolution = `${opts.resolution.width}x${opts.resolution.height}x24`;
    // X11 is local to the sandbox; TCP transport stays disabled.
    this._starting = this._startProcess(`Xvfb ${shellQuote(this.display)} -ac -screen 0 ${shellQuote(resolution)} -retro -dpi ${shellQuote(opts.dpi)} -nolisten tcp`)
        .then(() => this._waitUntil('xdpyinfo -display ' + shellQuote(this.display), 10000))
        .then(() => this._startProcess('startxfce4', 'start Xfce'))
        .then(() => this._waitUntil(this._xfceReadyCommand(), 60000))
        .then(() => {
            this._started = true;
            this._starting = null;
        }, err => {
            this._starting = null;
            throw err;
        });
    return this._starting;
};

Desktop.prototype.screenSize = function () {
    return this._run('get screen size', 'xrandr').then(result => {
        const match = /current\s+(\d+)\s+x\s+(\d+)/.exec(result.stdout);
        if (!match) throw new Error('Cannot parse desktop screen size');
        return { width: integer(Number(match[1]), 'width', 1), height: integer(Number(match[2]), 'height', 1) };
    });
};

Desktop.prototype.cursorPosition = function () {
    return this._run('get cursor position', 'xdotool getmouselocation').then(result => {
        const match = /x:(\d+)\s+y:(\d+)/.exec(result.stdout);
        if (!match) throw new Error('Cannot parse desktop cursor position');
        return { x: integer(Number(match[1]), 'x', 0), y: integer(Number(match[2]), 'y', 0) };
    });
};

// Keep composite input actions together, and allow subsequent actions after failure.
Desktop.prototype._action = function (fn) {
    const result = this._actions.then(fn).then(() => undefined);
    this._actions = result.catch(() => {});
    return result;
};

function pointArgs (point) {
    if (!point) throw new InvalidArgumentError('Desktop point is required');
    return shellQuote(integer(point.x, 'x', 0)) + ' ' + shellQuote(integer(point.y, 'y', 0));
}

function buttonNumber (button) {
    const buttons = { left: '1', middle: '2', right: '3' };
    if (!Object.prototype.hasOwnProperty.call(buttons, button)) {
        throw new InvalidArgumentError('Invalid desktop mouse button');
    }
    return shellQuote(buttons[button]);
}

// Older xdotool builds wait indefinitely with --sync when already at the target.
// Wait for command completion instead, including moves inside clicks and drags.
Desktop.prototype.moveMouse = function (point) {
    const args = pointArgs(point);
    return this._action(() => this._run('move mouse', 'xdotool mousemove ' + args));
};

Desktop.prototype.click = function (button, point) {
    const number = buttonNumber(button === undefined ? 'left' : button);
    const move = point == null ? null : pointArgs(point);
    return this._action(() => (move ? this._run('move mouse', 'xdotool mousemove ' + move) : Promise.resolve())
        .then(() => this._run('click mouse', 'xdotool click ' + number)));
};

Desktop.prototype.doubleClick = function (point) {
    const move = point == null ? null : pointArgs(point);
    return this._action(() => (move ? this._run('move mouse', 'xdotool mousemove ' + move) : Promise.resolve())
        .then(() => this._run('double click mouse', 'xdotool click --repeat \'2\' \'1\'')));
};

Desktop.prototype.mouseDown = function (button) {
    const number = buttonNumber(button);
    return this._action(() => this._run('press mouse button', 'xdotool mousedown ' + number));
};

Desktop.prototype.mouseUp = function (button) {
    const number = buttonNumber(button);
    return this._action(() => this._run('release mouse button', 'xdotool mouseup ' + number));
};

Desktop.prototype.drag = function (from, to) {
    const start = pointArgs(from);
    const end = pointArgs(to);
    return this._action(() => this._run('move mouse', 'xdotool mousemove ' + start)
        .then(() => this._run('press mouse button', 'xdotool mousedown \'1\''))
        .then(() => this._run('move mouse', 'xdotool mousemove ' + end).then(
            () => this._run('release mouse button', 'xdotool mouseup \'1\''),
            err => this._run('release mouse button', 'xdotool mouseup \'1\'').catch(cleanupError => {
                err.cleanupError = cleanupError;
            }).then(() => { throw err; })
        )));
};

Desktop.prototype.scroll = function (direction, amount) {
    integer(amount, 'scroll amount', 1);
    if (direction !== 'up' && direction !== 'down') throw new InvalidArgumentError('Invalid desktop scroll direction');
    return this._action(() => this._run('scroll mouse', `xdotool click --repeat ${shellQuote(amount)} ${shellQuote(direction === 'up' ? 4 : 5)}`));
};

Desktop.prototype.typeText = function (value, opts) {
    opts = opts || {};
    if (typeof value !== 'string' || value.indexOf('\0') >= 0) throw new InvalidArgumentError('Invalid desktop text');
    const chunkSize = integer(opts.chunkSize === undefined ? 25 : opts.chunkSize, 'text chunk size', 1);
    const delay = integer(opts.delayMs === undefined ? 75 : opts.delayMs, 'text delay', 0);
    const chars = Array.from(value);
    return this._action(() => {
        let chain = Promise.resolve();
        for (let i = 0; i < chars.length; i += chunkSize) {
            const chunk = chars.slice(i, i + chunkSize);
            chain = chain.then(() => this._run('type text', `xdotool type --delay ${shellQuote(delay)} -- ${shellQuote(chunk.join(''))}`, Math.min(2147483647, Math.max(10000, chunk.length * delay + 10000))));
        }
        return chain;
    });
};

const keyNames = {
    alt: 'Alt_L',
    alt_left: 'Alt_L',
    alt_right: 'Alt_R',
    backspace: 'BackSpace',
    break: 'Pause',
    caps_lock: 'Caps_Lock',
    cmd: 'Super_L',
    command: 'Super_L',
    control: 'Control_L',
    control_left: 'Control_L',
    control_right: 'Control_R',
    ctrl: 'Control_L',
    del: 'Delete',
    delete: 'Delete',
    down: 'Down',
    end: 'End',
    enter: 'Return',
    esc: 'Escape',
    escape: 'Escape',
    home: 'Home',
    insert: 'Insert',
    left: 'Left',
    menu: 'Menu',
    meta: 'Meta_L',
    num_lock: 'Num_Lock',
    page_down: 'Page_Down',
    page_up: 'Page_Up',
    pause: 'Pause',
    print: 'Print',
    right: 'Right',
    scroll_lock: 'Scroll_Lock',
    shift: 'Shift_L',
    shift_left: 'Shift_L',
    shift_right: 'Shift_R',
    space: 'space',
    super: 'Super_L',
    super_left: 'Super_L',
    super_right: 'Super_R',
    tab: 'Tab',
    up: 'Up',
    win: 'Super_L',
    windows: 'Super_L'
};
for (let i = 1; i <= 12; i++) keyNames['f' + i] = 'F' + i;

Desktop.prototype.press = function (...keys) {
    if (!keys.length) throw new InvalidArgumentError('At least one desktop key is required');
    const mapped = keys.map(key => {
        if (typeof key !== 'string' || !/^[A-Za-z0-9_]+$/.test(key)) throw new InvalidArgumentError('Invalid desktop key');
        const alias = key.toLowerCase();
        return Object.prototype.hasOwnProperty.call(keyNames, alias) ? keyNames[alias] : key;
    });
    return this._action(() => this._run('press key', 'xdotool key ' + shellQuote(mapped.join('+'))));
};

Desktop.prototype.open = function (pathOrURL) {
    return this._startProcess('xdg-open ' + shellQuote(text(pathOrURL, 'path or URL')), 'open file or URL').then(() => undefined);
};

Desktop.prototype.launch = function (application, ...args) {
    const parts = [text(application, 'application')].concat(args.map(arg => {
        if (typeof arg !== 'string' || arg.indexOf('\0') >= 0) throw new InvalidArgumentError('Invalid desktop application argument');
        return arg;
    }));
    // Execute argv directly: gtk-launch interprets arguments as its own options or URIs.
    return this._startProcess('exec -- ' + parts.map(shellQuote).join(' '), 'launch application').then(() => undefined);
};

Desktop.prototype.activeWindowID = function () {
    return this._run('get active window', 'xdotool getwindowfocus').then(result => result.stdout.trim());
};

Desktop.prototype.applicationWindows = function (application) {
    return this._runRaw('xdotool search --onlyvisible --class ' + shellQuote(text(application, 'application'))).then(result => {
        const output = result.stdout.trim();
        if (result.exitCode === 1 && !output && !result.stderr.trim()) return [];
        this._checkResult('find application windows', result);
        return output ? output.split(/\r?\n/) : [];
    });
};

Desktop.prototype.windowTitle = function (windowID) {
    return this._run('get window title', 'xdotool getwindowname ' + shellQuote(text(windowID, 'window ID'))).then(result => result.stdout.trim());
};

Desktop.prototype.wait = function (durationMs) {
    integer(durationMs, 'wait duration', 0, 2147483647);
    return new Promise(resolve => setTimeout(resolve, durationMs));
};

Desktop.prototype.screenshot = function () {
    const path = '/tmp/qiniu-desktop-screenshot-' + crypto.randomBytes(16).toString('hex') + '.png';
    const cleanup = () => this.sandbox.files.remove(path).catch(() => {});
    return this._run('take screenshot', 'scrot --pointer ' + shellQuote(path))
        .then(() => this.sandbox.files.read(path, { format: 'bytes' }))
        .then(data => cleanup().then(() => data), err => cleanup().then(() => { throw err; }));
};

exports.Desktop = Desktop;
exports.DEFAULT_DESKTOP_TEMPLATE = DEFAULT_DESKTOP_TEMPLATE;
