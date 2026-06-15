const { SandboxClient } = require('./client');
const { shellQuote } = require('./util');
const fs = require('fs');

function Template () {
    if (!(this instanceof Template)) {
        return new Template();
    }
    this.buildConfig = {
        steps: []
    };
    this._forceNextLayer = false;
}

Template.prototype.fromImage = function (image, credentials) {
    this.buildConfig.fromImage = image;
    delete this.buildConfig.fromTemplate;
    if (credentials) {
        this.buildConfig.fromImageRegistry = {
            type: 'registry',
            username: credentials.username,
            password: credentials.password
        };
    } else {
        delete this.buildConfig.fromImageRegistry;
    }
    if (this._forceNextLayer) {
        this.buildConfig.force = true;
    }
    return this;
};

Template.prototype.fromAWSRegistry = function (image, credentials) {
    this.buildConfig.fromImage = image;
    delete this.buildConfig.fromTemplate;
    this.buildConfig.fromImageRegistry = {
        type: 'aws',
        awsAccessKeyId: credentials.accessKeyId,
        awsSecretAccessKey: credentials.secretAccessKey,
        awsRegion: credentials.region
    };
    if (this._forceNextLayer) {
        this.buildConfig.force = true;
    }
    return this;
};

Template.prototype.fromGCPRegistry = function (image, credentials) {
    this.buildConfig.fromImage = image;
    delete this.buildConfig.fromTemplate;
    const serviceAccountJSON = credentials.serviceAccountJSON;
    this.buildConfig.fromImageRegistry = {
        type: 'gcp',
        serviceAccountJson: typeof serviceAccountJSON === 'string'
            ? serviceAccountJSON
            : JSON.stringify(serviceAccountJSON)
    };
    if (this._forceNextLayer) {
        this.buildConfig.force = true;
    }
    return this;
};

Template.prototype.fromTemplate = function (templateID) {
    this.buildConfig.fromTemplate = templateID;
    delete this.buildConfig.fromImage;
    delete this.buildConfig.fromImageRegistry;
    if (this._forceNextLayer) {
        this.buildConfig.force = true;
    }
    return this;
};

function padOctal (value) {
    let text = typeof value === 'number' ? value.toString(8) : String(value || '');
    if (text.startsWith('0o') || text.startsWith('0O')) {
        text = text.slice(2);
    }
    while (text.length < 4) {
        text = `0${text}`;
    }
    return text;
}

function asArray (value) {
    return Array.isArray(value) ? value : [value];
}

function addStep (template, type, args, extra) {
    const step = Object.assign({
        type,
        args: args.map(value => String(value))
    }, extra || {});
    if (template._forceNextLayer && step.force === undefined) {
        step.force = true;
    }
    template.buildConfig.steps.push(step);
    return template;
}

function runShellStep (template, command, options) {
    const args = [Array.isArray(command) ? command.join(' && ') : command];
    if (options && options.user) {
        args.push(options.user);
    }
    return addStep(template, 'RUN', args);
}

function parseEnvArgs (value) {
    const args = [];
    const index = value.search(/\s+/);
    if (index > 0) {
        const firstWord = value.slice(0, index);
        if (firstWord.indexOf('=') < 0) {
            args.push(firstWord.trim(), unquoteDockerfileValue(value.slice(index + 1).trim()));
            return args;
        }
    } else if (value.indexOf('=') < 0) {
        return args;
    }
    const pattern = /([A-Za-z_][A-Za-z0-9_]*)=("(\\.|[^"\\])*"|'(\\.|[^'\\])*'|\S+)/g;
    let match;
    while ((match = pattern.exec(value))) {
        args.push(match[1], unquoteDockerfileValue(match[2]));
    }
    return args;
}

function unquoteDockerfileValue (value) {
    if (
        (value[0] === '"' && value[value.length - 1] === '"') ||
        (value[0] === '\'' && value[value.length - 1] === '\'')
    ) {
        return value.slice(1, -1)
            .replace(/\\"/g, '"')
            .replace(/\\'/g, '\'')
            .replace(/\\\\/g, '\\');
    }
    return value;
}

function joinDockerfileLines (content) {
    const lines = [];
    let current = '';
    String(content || '').split(/\r?\n/).forEach(rawLine => {
        const line = rawLine.trim();
        if (!line || line[0] === '#') {
            if (current) {
                lines.push(current);
                current = '';
            }
            lines.push(line);
            return;
        }
        const trailingBackslashes = (line.match(/\\+$/) || [''])[0].length;
        if (trailingBackslashes % 2 === 1) {
            current += line.slice(0, -1) + ' ';
            return;
        }
        lines.push(current + line);
        current = '';
    });
    if (current) {
        lines.push(current);
    }
    return lines;
}

function splitDockerfileArgs (value) {
    value = String(value || '').trim();
    if (value.charAt(0) === '[' && value.charAt(value.length - 1) === ']') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.map(item => String(item));
            }
        } catch (err) {
            // Fall through to the shell-style parser below.
        }
    }
    const args = [];
    let current = '';
    let quote = '';
    let escape = false;
    for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        if (escape) {
            current += ch;
            escape = false;
            continue;
        }
        if (ch === '\\') {
            escape = true;
            continue;
        }
        if (quote) {
            if (ch === quote) {
                quote = '';
            } else {
                current += ch;
            }
            continue;
        }
        if (ch === '"' || ch === '\'') {
            quote = ch;
            continue;
        }
        if (/\s/.test(ch)) {
            if (current) {
                args.push(current);
                current = '';
            }
            continue;
        }
        current += ch;
    }
    if (escape) {
        current += '\\';
    }
    if (current) {
        args.push(current);
    }
    return args;
}

function dockerfileCopyArgs (value) {
    const args = splitDockerfileArgs(value);
    const flagsWithValue = {
        '--checksum': true,
        '--chmod': true,
        '--chown': true,
        '--exclude': true
    };
    while (args.length && /^--/.test(args[0])) {
        const flag = args.shift();
        if (/^--from(?:=|$)/i.test(flag)) {
            return [];
        }
        const flagName = flag.split('=')[0].toLowerCase();
        if (flag.indexOf('=') < 0 && flagsWithValue[flagName] && args.length > 2) {
            args.shift();
        }
    }
    return args;
}

function dockerfileFromImage (value) {
    const parts = splitDockerfileArgs(value);
    for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        if (/^--/.test(part)) {
            continue;
        }
        if (/^AS$/i.test(part)) {
            break;
        }
        return part;
    }
    return null;
}

Template.prototype.fromDockerfile = function (dockerfileContentOrPath) {
    if (typeof dockerfileContentOrPath !== 'string') {
        throw new TypeError('Dockerfile content or path must be a string');
    }
    const hasNewlines = dockerfileContentOrPath.indexOf('\n') >= 0 || dockerfileContentOrPath.indexOf('\r') >= 0;
    const startsWithInstruction = /^\s*(ADD|ARG|CMD|COPY|ENTRYPOINT|ENV|EXPOSE|FROM|HEALTHCHECK|LABEL|ONBUILD|RUN|SHELL|STOPSIGNAL|USER|VOLUME|WORKDIR)\b/i.test(dockerfileContentOrPath);
    const isLikelyPath = dockerfileContentOrPath.length < 1024 && !hasNewlines && !startsWithInstruction;
    if (isLikelyPath && !fs.existsSync(dockerfileContentOrPath)) {
        throw new Error(`Dockerfile file not found at path: ${dockerfileContentOrPath}`);
    }
    const isPath = isLikelyPath && fs.existsSync(dockerfileContentOrPath);
    let content = dockerfileContentOrPath;
    if (isPath) {
        try {
            content = fs.readFileSync(dockerfileContentOrPath, 'utf8');
        } catch (err) {
            throw new Error(`Failed to read Dockerfile at ${dockerfileContentOrPath}: ${err.message}`);
        }
    }
    joinDockerfileLines(content).forEach(line => {
        line = line.trim();
        if (!line || line[0] === '#') {
            return;
        }
        const match = line.match(/^([A-Z]+)\s+(.+)$/i);
        if (!match) {
            return;
        }
        const instruction = match[1].toUpperCase();
        const rest = match[2].trim();
        if (instruction === 'FROM') {
            const image = dockerfileFromImage(rest);
            if (image) {
                this.fromImage(image);
            }
        } else if (instruction === 'RUN') {
            this.runCmd(rest);
        } else if (instruction === 'WORKDIR') {
            this.setWorkdir(rest);
        } else if (instruction === 'USER') {
            this.setUser(rest);
        } else if (instruction === 'ENV') {
            const args = parseEnvArgs(rest);
            if (args.length) {
                addStep(this, 'ENV', args);
            }
        } else if (instruction === 'COPY' || instruction === 'ADD') {
            const parts = dockerfileCopyArgs(rest);
            if (parts.length >= 2) {
                this.copy(parts.slice(0, -1), parts[parts.length - 1]);
            }
        }
    });
    return this;
};

Template.prototype.aptInstall = function (packages, options) {
    if (options) {
        const packageList = asArray(packages).map(shellQuote);
        return this.runCmd([
            'apt-get update',
            `DEBIAN_FRONTEND=noninteractive DEBCONF_NOWARNINGS=yes apt-get install -y ${options.noInstallRecommends ? '--no-install-recommends ' : ''}${options.fixMissing ? '--fix-missing ' : ''}${packageList.join(' ')}`
        ], { user: 'root' });
    }
    this.buildConfig.steps.push({
        type: 'apt',
        packages: asArray(packages)
    });
    return this;
};

Template.prototype.runCmd = function (cmd, options) {
    if (Array.isArray(cmd) || options || this._forceNextLayer) {
        return runShellStep(this, cmd, options);
    }
    this.buildConfig.steps.push({
        type: 'run',
        cmd
    });
    return this;
};

Template.prototype.copy = function (src, dest, options) {
    if (Array.isArray(src) || options) {
        asArray(src).forEach(item => {
            const args = [item, dest];
            if (options && options.user) {
                args.push(options.user);
            } else if (options && options.mode) {
                args.push('');
            }
            if (options && options.mode) {
                args.push(padOctal(options.mode));
            }
            const extra = {};
            if (options && options.forceUpload) {
                extra.forceUpload = options.forceUpload;
            }
            if (options && options.resolveSymlinks !== undefined) {
                extra.resolveSymlinks = options.resolveSymlinks;
            }
            addStep(this, 'COPY', args, extra);
        });
        return this;
    }
    this.buildConfig.steps.push({
        type: 'copy',
        src,
        dest
    });
    return this;
};

Template.prototype.copyItems = function (items) {
    items.forEach(item => {
        this.copy(item.src, item.dest, {
            forceUpload: item.forceUpload,
            user: item.user,
            mode: item.mode,
            resolveSymlinks: item.resolveSymlinks
        });
    });
    return this;
};

Template.prototype.remove = function (path, options) {
    options = options || {};
    const args = ['rm'];
    if (options.recursive) {
        args.push('-r');
    }
    if (options.force) {
        args.push('-f');
    }
    args.push.apply(args, asArray(path).map(shellQuote));
    return this.runCmd(args.join(' '), { user: options.user });
};

Template.prototype.rename = function (src, dest, options) {
    options = options || {};
    const args = ['mv'];
    if (options.force) {
        args.push('-f');
    }
    args.push(shellQuote(src), shellQuote(dest));
    return this.runCmd(args.join(' '), { user: options.user });
};

Template.prototype.makeDir = function (path, options) {
    options = options || {};
    const args = ['mkdir', '-p'];
    if (options.mode) {
        args.push(`-m ${padOctal(options.mode)}`);
    }
    args.push.apply(args, asArray(path).map(shellQuote));
    return this.runCmd(args.join(' '), { user: options.user });
};

Template.prototype.makeSymlink = function (src, dest, options) {
    options = options || {};
    const args = ['ln', '-s'];
    if (options.force) {
        args.push('-f');
    }
    args.push(shellQuote(src), shellQuote(dest));
    return this.runCmd(args.join(' '), { user: options.user });
};

Template.prototype.setWorkdir = function (workdir) {
    return addStep(this, 'WORKDIR', [workdir]);
};

Template.prototype.setUser = function (user) {
    return addStep(this, 'USER', [user]);
};

Template.prototype.pipInstall = function (packages, options) {
    if (packages && typeof packages === 'object' && !Array.isArray(packages) && !Buffer.isBuffer(packages) && options === undefined) {
        options = packages;
        packages = undefined;
    }
    options = options || {};
    const args = ['pip', 'install'];
    if (options.g === false) {
        args.push('--user');
    }
    if (packages) {
        args.push.apply(args, asArray(packages).map(shellQuote));
    } else {
        args.push('.');
    }
    return this.runCmd(args.join(' '), { user: options.g === false ? undefined : 'root' });
};

Template.prototype.npmInstall = function (packages, options) {
    if (packages && typeof packages === 'object' && !Array.isArray(packages) && !Buffer.isBuffer(packages) && options === undefined) {
        options = packages;
        packages = undefined;
    }
    options = options || {};
    const args = ['npm', 'install'];
    if (options.g) {
        args.push('-g');
    }
    if (options.dev) {
        args.push('--save-dev');
    }
    if (packages) {
        args.push.apply(args, asArray(packages).map(shellQuote));
    }
    return this.runCmd(args.join(' '), { user: options.g ? 'root' : undefined });
};

Template.prototype.bunInstall = function (packages, options) {
    if (packages && typeof packages === 'object' && !Array.isArray(packages) && !Buffer.isBuffer(packages) && options === undefined) {
        options = packages;
        packages = undefined;
    }
    options = options || {};
    if (packages) {
        const args = ['bun', 'add'];
        if (options.g) {
            args.push('-g');
        }
        if (options.dev) {
            args.push('--dev');
        }
        args.push.apply(args, asArray(packages).map(shellQuote));
        return this.runCmd(args.join(' '), { user: options.g ? 'root' : undefined });
    }
    return this.runCmd('bun install');
};

Template.prototype.gitClone = function (url, path, options) {
    if (path && typeof path === 'object' && !Array.isArray(path) && !Buffer.isBuffer(path) && options === undefined) {
        options = path;
        path = undefined;
    }
    options = options || {};
    const args = ['git', 'clone', shellQuote(url)];
    if (options.branch) {
        args.push('--branch', shellQuote(options.branch), '--single-branch');
    }
    if (options.depth) {
        args.push('--depth', shellQuote(options.depth));
    }
    if (path) {
        args.push(shellQuote(path));
    }
    return this.runCmd(args.join(' '), { user: options.user });
};

Template.prototype.setEnvs = function (envs) {
    const keys = Object.keys(envs || {});
    if (!keys.length) {
        return this;
    }
    const args = [];
    keys.forEach(key => {
        args.push(key, envs[key]);
    });
    return addStep(this, 'ENV', args);
};

Template.prototype.skipCache = function () {
    this._forceNextLayer = true;
    return this;
};

Template.prototype.setStartCmd = function (cmd) {
    this.buildConfig.startCmd = cmd;
    return this;
};

Template.prototype.setReadyCmd = function (cmd) {
    this.buildConfig.readyCmd = cmd;
    return this;
};

function templateClientOptions (opts) {
    const clientOpts = {};
    [
        'endpoint',
        'apiUrl',
        'apiKey',
        'accessToken',
        'mac',
        'accessKey',
        'secretKey',
        'macOptions',
        'httpAgent',
        'httpsAgent'
    ].forEach(key => {
        if (opts[key] !== undefined) {
            clientOpts[key] = opts[key];
        }
    });
    if (opts.requestTimeoutMs !== undefined) {
        clientOpts.timeout = opts.requestTimeoutMs;
    }
    return clientOpts;
}

Template.prototype.build = function (opts) {
    opts = opts || {};
    const client = opts.client || new SandboxClient(templateClientOptions(opts));
    const body = Object.assign({}, opts, {
        buildConfig: this.buildConfig
    });
    delete body.client;
    delete body.endpoint;
    delete body.apiUrl;
    delete body.apiKey;
    delete body.accessToken;
    delete body.mac;
    delete body.accessKey;
    delete body.secretKey;
    delete body.macOptions;
    delete body.httpAgent;
    delete body.httpsAgent;
    delete body.timeout;
    delete body.requestTimeoutMs;
    return client.createTemplateV3(body);
};

exports.Template = Template;
