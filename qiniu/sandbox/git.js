const { shellQuote } = require('./util');
const { GitAuthError, GitUpstreamError, InvalidArgumentError } = require('./errors');

function Git (commands) {
    this.commands = commands;
}

function gitConfigArgs (opts) {
    opts = opts || {};
    const config = opts.config || {};
    return Object.keys(config).map(key => {
        return ['-c', shellQuote(`${key}=${config[key]}`)];
    }).reduce((acc, item) => acc.concat(item), []);
}

function pathAndOptions (pathOrOpts, maybeOpts) {
    if (typeof pathOrOpts === 'string') {
        return { path: pathOrOpts, opts: Object.assign({}, maybeOpts || {}) };
    }
    const opts = Object.assign({}, pathOrOpts || {});
    return { path: opts.path, opts };
}

function authUrl (repoUrl, opts) {
    opts = opts || {};
    if (!opts.username && !opts.password) {
        return repoUrl;
    }
    if (!opts.username || !opts.password) {
        throw new GitAuthError('Both username and password are required for git authentication');
    }
    return repoUrl.replace(/^(https?):\/\//, `$1://${encodeURIComponent(opts.username)}:${encodeURIComponent(opts.password)}@`);
}

function stripAuth (repoUrl) {
    return String(repoUrl || '').replace(/^(https?):\/\/[^/@]+:[^/@]+@/, '$1://');
}

function credentialHelperArgs (opts) {
    opts = opts || {};
    if (!opts.username && !opts.password) {
        return [];
    }
    if (!opts.username || !opts.password) {
        throw new GitAuthError('Both username and password are required for git authentication');
    }
    return [
        '-c',
        shellQuote('credential.helper=!f() { echo username=$GIT_USERNAME; echo password=$GIT_PASSWORD; }; f'),
        '-c',
        shellQuote('credential.useHttpPath=true')
    ];
}

function gitCredentialOptions (opts) {
    opts = Object.assign({}, opts || {});
    if (opts.username || opts.password) {
        if (!opts.username || !opts.password) {
            throw new GitAuthError('Both username and password are required for git authentication');
        }
        opts.envs = Object.assign({}, opts.envs || {}, {
            GIT_USERNAME: opts.username,
            GIT_PASSWORD: opts.password
        });
    }
    return opts;
}

function configScopeArg (opts) {
    opts = opts || {};
    if (opts.scope === 'global') {
        return '--global';
    }
    if (opts.scope === 'system') {
        return '--system';
    }
    if (opts.scope === 'local') {
        return '--local';
    }
    return null;
}

function pathFromOpts (opts) {
    return opts && opts.path;
}

function normalizeConfigCall (args) {
    if (typeof args[2] === 'object' && args[2] !== null) {
        return {
            repoPath: pathFromOpts(args[2]),
            key: args[0],
            value: args[1],
            opts: Object.assign({}, args[2])
        };
    }
    return {
        repoPath: args[0],
        key: args[1],
        value: args[2],
        opts: Object.assign({}, args[3] || {})
    };
}

function normalizeGetConfigCall (args) {
    if (typeof args[1] === 'object' && args[1] !== null) {
        return {
            repoPath: pathFromOpts(args[1]),
            key: args[0],
            opts: Object.assign({}, args[1])
        };
    }
    return {
        repoPath: args[0],
        key: args[1],
        opts: Object.assign({}, args[2] || {})
    };
}

function normalizeConfigureUserCall (args) {
    if (typeof args[2] === 'object' && args[2] !== null) {
        return {
            repoPath: pathFromOpts(args[2]),
            name: args[0],
            email: args[1],
            opts: Object.assign({}, args[2])
        };
    }
    return {
        repoPath: args[0],
        name: args[1],
        email: args[2],
        opts: Object.assign({}, args[3] || {})
    };
}

Git.prototype._runGit = function (repoPath, args, opts) {
    opts = Object.assign({}, opts || {});
    if (repoPath) {
        opts.cwd = repoPath;
    }
    return this.commands.run(`git ${gitConfigArgs(opts).concat(args).join(' ')}`, opts);
};

Git.prototype.clone = function (repoUrl, pathOrOpts, maybeOpts) {
    const normalized = pathAndOptions(pathOrOpts, maybeOpts);
    const opts = gitCredentialOptions(normalized.opts);
    const args = gitConfigArgs(opts).concat(credentialHelperArgs(opts)).concat(['clone', shellQuote(stripAuth(repoUrl))]);
    if (opts.depth) {
        args.push('--depth', shellQuote(opts.depth));
    }
    if (opts.branch) {
        args.push('--branch', shellQuote(opts.branch));
    }
    if (normalized.path) {
        args.push(shellQuote(normalized.path));
    }
    return this.commands.run(`git ${args.join(' ')}`, opts);
};

Git.prototype.init = function (repoPath, opts) {
    opts = opts || {};
    const args = ['init'];
    if (opts.bare) {
        args.push('--bare');
    }
    if (opts.initialBranch) {
        args.push('--initial-branch', shellQuote(opts.initialBranch));
    }
    return this._runGit(repoPath, args, opts);
};

Git.prototype.status = function (repoPath, opts) {
    return this._runGit(repoPath, ['status', '--porcelain=v1', '-b'], opts)
        .then(result => parseGitStatus(result.stdout));
};

Git.prototype.add = function (repoPath, opts) {
    opts = opts || {};
    const files = opts.all ? ['--all'] : (opts.files || ['.']).map(shellQuote);
    return this._runGit(repoPath, ['add'].concat(files), opts);
};

Git.prototype.commit = function (repoPath, message, opts) {
    opts = opts || {};
    const args = ['commit', '-m', shellQuote(message)];
    if (opts.authorName || opts.authorEmail) {
        if (!opts.authorName || !opts.authorEmail) {
            throw new GitAuthError('Both authorName and authorEmail are required for git commit author');
        }
        args.push('--author', shellQuote(`${opts.authorName} <${opts.authorEmail}>`));
    }
    if (opts.allowEmpty) {
        args.push('--allow-empty');
    }
    return this._runGit(repoPath, args, opts);
};

Git.prototype.pull = function (repoPath, opts) {
    opts = opts || {};
    const args = ['pull'];
    if (opts.remote) {
        args.push(shellQuote(opts.remote));
    }
    if (opts.branch) {
        args.push(shellQuote(opts.branch));
    }
    return this._runGitWithTemporaryAuth(repoPath, args, opts);
};

Git.prototype.push = function (repoPath, opts) {
    opts = opts || {};
    const args = ['push'];
    if (opts.remote) {
        args.push(shellQuote(opts.remote));
    }
    if (opts.branch) {
        args.push(shellQuote(opts.branch));
    }
    return this._runGitWithTemporaryAuth(repoPath, args, opts);
};

Git.prototype.createBranch = function (repoPath, branch, opts) {
    return this._runGit(repoPath, ['checkout', '-b', shellQuote(branch)], opts);
};

Git.prototype.checkoutBranch = function (repoPath, branch, opts) {
    return this._runGit(repoPath, ['checkout', shellQuote(branch)], opts);
};

Git.prototype.deleteBranch = function (repoPath, branch, opts) {
    opts = opts || {};
    return this._runGit(repoPath, ['branch', opts.force ? '-D' : '-d', shellQuote(branch)], opts);
};

Git.prototype.remoteAdd = function (repoPath, name, repoUrl, opts) {
    opts = opts || {};
    const add = () => this._runGit(repoPath, ['remote', 'add', shellQuote(name), shellQuote(repoUrl)], opts);
    const afterAdd = () => opts.fetch ? this._runGit(repoPath, ['fetch', shellQuote(name)], opts) : null;
    if (opts.overwrite) {
        return this._runGit(repoPath, ['remote', 'remove', shellQuote(name)], opts)
            .then(add, add)
            .then(afterAdd);
    }
    return add().then(afterAdd);
};

Git.prototype.remoteGet = function (repoPath, name, opts) {
    return this._runGit(repoPath, ['remote', 'get-url', shellQuote(name)], opts)
        .then(result => result.exitCode ? undefined : result.stdout.trim());
};

Git.prototype.setConfig = function () {
    const normalized = normalizeConfigCall(arguments);
    const opts = normalized.opts;
    delete opts.path;
    const scope = configScopeArg(opts);
    const args = ['config'];
    if (scope) {
        args.push(scope);
    }
    args.push(shellQuote(normalized.key), shellQuote(normalized.value));
    return this._runGit(normalized.repoPath, args, opts);
};

Git.prototype.getConfig = function () {
    const normalized = normalizeGetConfigCall(arguments);
    const opts = normalized.opts;
    delete opts.path;
    const scope = configScopeArg(opts);
    const args = ['config'];
    if (scope) {
        args.push(scope);
    }
    args.push('--get', shellQuote(normalized.key));
    return this._runGit(normalized.repoPath, args, opts)
        .then(result => result.stdout.trim());
};

Git.prototype.configureUser = function () {
    const normalized = normalizeConfigureUserCall(arguments);
    const opts = normalized.opts;
    if (normalized.repoPath && opts.path === undefined) {
        opts.path = normalized.repoPath;
    }
    return this.setConfig('user.name', normalized.name, opts)
        .then(() => this.setConfig('user.email', normalized.email, opts));
};

Git.prototype.branches = function (repoPath, opts) {
    return this._runGit(repoPath, ['branch', '--format=%(HEAD) %(refname:short)'], opts)
        .then(result => String(result.stdout || '').split(/\r?\n/)
            .filter(Boolean)
            .map(line => ({
                current: line.charAt(0) === '*',
                name: line.slice(2).trim()
            })));
};

Git.prototype.reset = function (repoPath, opts) {
    opts = opts || {};
    const args = ['reset'];
    const mode = opts.mode || (opts.hard ? 'hard' : null) || (opts.soft ? 'soft' : null) || (opts.mixed ? 'mixed' : null);
    if (mode) {
        if (['soft', 'mixed', 'hard', 'merge', 'keep'].indexOf(mode) === -1) {
            throw new InvalidArgumentError(`Invalid git reset mode: ${mode}`);
        }
        args.push(`--${mode}`);
    }
    const target = opts.target || opts.ref;
    if (target) {
        args.push(shellQuote(target));
    }
    const paths = opts.paths || opts.files || [];
    if (paths.length) {
        args.push('--');
        paths.forEach(path => args.push(shellQuote(path)));
    }
    return this._runGit(repoPath, args, opts);
};

Git.prototype.restore = function (repoPath, opts) {
    opts = opts || {};
    const args = ['restore'];
    const staged = opts.staged;
    let worktree = opts.worktree;
    if (staged === undefined && worktree === undefined) {
        worktree = true;
    } else if (staged === true && worktree === undefined) {
        worktree = false;
    }
    if (worktree) {
        args.push('--worktree');
    }
    if (staged) {
        args.push('--staged');
    }
    if (opts.source) {
        args.push('--source', shellQuote(opts.source));
    }
    const paths = opts.paths || opts.files || [];
    if (paths.length) {
        args.push('--');
        paths.forEach(path => args.push(shellQuote(path)));
    }
    return this._runGit(repoPath, args, opts);
};

Git.prototype.dangerouslyAuthenticate = function (repoPath, remote, username, password, opts) {
    opts = opts || {};
    return this.remoteGet(repoPath, remote, opts).then(repoUrl => {
        if (!repoUrl) {
            throw new GitUpstreamError(`Remote ${remote} does not exist`);
        }
        return this._runGit(repoPath, ['remote', 'set-url', shellQuote(remote), shellQuote(authUrl(repoUrl, {
            username,
            password
        }))], opts);
    });
};

Git.prototype._runGitWithTemporaryAuth = function (repoPath, args, opts) {
    opts = opts || {};
    if (!opts.username && !opts.password) {
        return this._runGit(repoPath, args, opts);
    }
    const runOpts = gitCredentialOptions(opts);
    const authArgs = credentialHelperArgs(runOpts).concat(args);
    return this._runGit(repoPath, authArgs, runOpts);
};

function parseGitStatus (stdout) {
    stdout = String(stdout || '').replace(/\\n/g, '\n');
    const status = {
        currentBranch: '',
        changedFiles: [],
        untrackedFiles: [],
        raw: stdout
    };
    stdout.split(/\r?\n/).forEach(line => {
        if (!line) {
            return;
        }
        if (line.indexOf('## ') === 0) {
            status.currentBranch = line.slice(3).split('...')[0].trim();
            return;
        }
        if (line.indexOf('?? ') === 0) {
            status.untrackedFiles.push(line.slice(3).trim());
            return;
        }
        status.changedFiles.push(line.slice(3).trim());
    });
    return status;
}

exports.Git = Git;
exports.parseGitStatus = parseGitStatus;
exports.stripAuth = stripAuth;
