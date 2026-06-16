const {
    should,
    qiniu
} = require('./sandbox_helpers');

describe('test sandbox git module', function () {
    it('supports E2B git auth, branches, reset, restore, and safe remote cleanup', function () {
        const commandsSeen = [];
        const git = new qiniu.sandbox.Git({
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                if (cmd.indexOf('branch ') >= 0 && cmd.indexOf('%(refname:short)') >= 0) {
                    return Promise.resolve({ stdout: '* main\n  feature\n', exitCode: 0 });
                }
                if (cmd.indexOf('remote get-url') >= 0) {
                    return Promise.resolve({ stdout: 'https://github.com/acme/repo.git\n', exitCode: 0 });
                }
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
            }
        });

        return git.clone('https://github.com/acme/repo.git', '/repo', {
            username: 'u',
            password: 'p',
            depth: 1,
            branch: 'main'
        }).then(() => git.branches('/repo'))
            .then(branches => {
                branches.should.eql([
                    { name: 'main', current: true },
                    { name: 'feature', current: false }
                ]);
                return git.reset('/repo', { hard: true, ref: 'HEAD~1' });
            })
            .then(() => git.restore('/repo', { staged: true, paths: ['a.txt'] }))
            .then(() => git.reset('/repo', { ref: 'HEAD', paths: 'single.txt' }))
            .then(() => git.restore('/repo', { files: 'restore.txt' }))
            .then(() => git.remoteAdd('/repo', 'origin', 'https://github.com/acme/repo.git', { overwrite: true, fetch: true }))
            .then(() => git.commit('/repo', 'msg', {
                authorName: 'Alice',
                authorEmail: 'alice@example.com',
                allowEmpty: true
            }))
            .then(() => git.setConfig('/repo', 'user.name', 'Alice', { scope: 'global' }))
            .then(() => {
                const commandText = commandsSeen.map(item => item.cmd).join('\n');
                commandText.should.containEql('credential.helper=');
                commandText.should.containEql('clone \'https://github.com/acme/repo.git\'');
                commandText.should.not.containEql('u:p');
                commandsSeen[0].opts.envs.should.eql({
                    GIT_USERNAME: 'u',
                    GIT_PASSWORD: 'p'
                });
                commandText.should.containEql('branch \'--format=%(HEAD) %(refname:short)\'');
                commandText.should.containEql('reset --hard \'HEAD~1\'');
                commandText.should.containEql('restore --staged -- \'a.txt\'');
                commandText.should.containEql('reset \'HEAD\' -- \'single.txt\'');
                commandText.should.containEql('restore --worktree -- \'restore.txt\'');
                commandText.should.containEql('remote remove \'origin\'');
                commandText.should.containEql('remote add \'origin\'');
                commandText.should.containEql('fetch \'origin\'');
                commandText.should.containEql('commit -m \'msg\' --author \'Alice <alice@example.com>\' --allow-empty');
                commandText.should.containEql('config --global \'user.name\' \'Alice\'');
            });
    });

    it('returns git remote add result when fetch is not requested', function () {
        const git = new qiniu.sandbox.Git({
            run: function () {
                return Promise.resolve({
                    stdout: 'added',
                    stderr: '',
                    exitCode: 0
                });
            }
        });

        return git.remoteAdd('/repo', 'origin', 'https://github.com/acme/repo.git').then(result => {
            result.should.eql({
                stdout: 'added',
                stderr: '',
                exitCode: 0
            });
        });
    });

    it('does not fetch after git remote add fails', function () {
        const commandsSeen = [];
        const git = new qiniu.sandbox.Git({
            run: function (cmd) {
                commandsSeen.push(cmd);
                if (cmd.indexOf(' remote add ') >= 0) {
                    return Promise.resolve({ stdout: '', stderr: 'bad remote', exitCode: 1 });
                }
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
            }
        });

        return git.remoteAdd('/repo', 'origin', 'bad-url', { fetch: true }).then(result => {
            result.exitCode.should.eql(1);
            commandsSeen.should.eql([
                'git remote add \'origin\' \'bad-url\''
            ]);
        });
    });

    it('passes git push credentials through a helper when push fails', function () {
        const commandsSeen = [];
        const git = new qiniu.sandbox.Git({
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                if (cmd.indexOf(' push ') >= 0) {
                    return Promise.reject(new Error('push failed'));
                }
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
            }
        });

        return git.push('/repo', {
            username: 'u',
            password: 'p',
            remote: 'origin',
            branch: 'main'
        }).then(() => {
            throw new Error('expected git push to fail');
        }, err => {
            err.message.should.eql('push failed');
            commandsSeen.length.should.eql(1);
            commandsSeen[0].cmd.should.containEql('credential.helper=');
            commandsSeen[0].cmd.should.containEql('printf "username=%s\\npassword=%s\\n" "$GIT_USERNAME" "$GIT_PASSWORD"');
            commandsSeen[0].cmd.should.containEql('push \'origin\' \'main\'');
            commandsSeen[0].cmd.should.not.containEql('u:p');
            commandsSeen[0].opts.envs.should.eql({
                GIT_USERNAME: 'u',
                GIT_PASSWORD: 'p'
            });
        });
    });

    it('passes git pull credentials through a helper without rewriting remotes', function () {
        const commandsSeen = [];
        const git = new qiniu.sandbox.Git({
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
            }
        });

        return git.pull('/repo', {
            username: 'u',
            password: 'p',
            remote: 'origin',
            branch: 'main'
        }).then(() => {
            commandsSeen.length.should.eql(1);
            commandsSeen[0].cmd.should.containEql('credential.helper=');
            commandsSeen[0].cmd.should.containEql('pull \'origin\' \'main\'');
            commandsSeen[0].cmd.should.not.containEql('u:p');
            commandsSeen[0].opts.envs.should.eql({
                GIT_USERNAME: 'u',
                GIT_PASSWORD: 'p'
            });
        });
    });

    it('passes git clone credentials through a helper instead of the command line', function () {
        const commandsSeen = [];
        const git = new qiniu.sandbox.Git({
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
            }
        });

        return git.clone('https://github.com/acme/private.git', {
            username: 'u',
            password: 'p'
        }).then(() => {
            commandsSeen.length.should.eql(1);
            commandsSeen[0].cmd.should.containEql('credential.helper=');
            commandsSeen[0].cmd.should.containEql('clone \'https://github.com/acme/private.git\'');
            commandsSeen[0].cmd.should.not.containEql('u:p');
            commandsSeen[0].opts.envs.should.eql({
                GIT_USERNAME: 'u',
                GIT_PASSWORD: 'p'
            });
        });
    });

    it('keeps embedded git clone credentials when no helper credentials are provided', function () {
        const commandsSeen = [];
        const git = new qiniu.sandbox.Git({
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
            }
        });

        return git.clone('https://u:p@github.com/acme/private.git').then(() => {
            commandsSeen.length.should.eql(1);
            commandsSeen[0].cmd.should.containEql('clone \'https://u:p@github.com/acme/private.git\'');
            should.not.exist(commandsSeen[0].opts.envs);
        });
    });

    it('passes http git clone credentials through a helper instead of the command line', function () {
        const commandsSeen = [];
        const git = new qiniu.sandbox.Git({
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
            }
        });

        return git.clone('http://git.example.com/acme/private.git', {
            username: 'u',
            password: 'p'
        }).then(() => {
            commandsSeen.length.should.eql(1);
            commandsSeen[0].cmd.should.containEql('credential.helper=');
            commandsSeen[0].cmd.should.containEql('clone \'http://git.example.com/acme/private.git\'');
            commandsSeen[0].cmd.should.not.containEql('u:p');
            commandsSeen[0].opts.envs.should.eql({
                GIT_USERNAME: 'u',
                GIT_PASSWORD: 'p'
            });
        });
    });

    it('rejects unsafe git reset modes', function () {
        const git = new qiniu.sandbox.Git({
            run: function () {
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
            }
        });

        try {
            git.reset('/repo', {
                mode: 'hard; touch /tmp/pwned'
            });
            throw new Error('expected git reset to reject unsafe mode');
        } catch (err) {
            err.name.should.eql('InvalidArgumentError');
            err.message.should.match(/Invalid git reset mode/);
        }

        try {
            git.reset('/repo', {
                mode: 'hard',
                paths: ['a.txt']
            });
            throw new Error('expected git reset to reject mode with paths');
        } catch (err) {
            err.name.should.eql('InvalidArgumentError');
            err.message.should.match(/mode cannot be used when paths are specified/);
        }

        try {
            git.restore('/repo');
            throw new Error('expected git restore to reject missing paths');
        } catch (err) {
            err.name.should.eql('InvalidArgumentError');
            err.message.should.match(/At least one path/);
        }
    });

    it('surfaces git auth and validation errors on auth helpers', function () {
        const git = new qiniu.sandbox.Git({
            run: function () {
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 1 });
            }
        });

        try {
            git.push('/repo', {
                username: 'u'
            });
            throw new Error('expected missing password');
        } catch (err) {
            err.name.should.eql('GitAuthError');
        }

        return git.dangerouslyAuthenticate('/repo', 'origin', 'u', 'p').then(() => {
            throw new Error('expected missing upstream');
        }, err => {
            err.name.should.eql('GitUpstreamError');
            return git.commit('/repo', 'msg', {
                authorName: 'Alice'
            });
        }).then(() => {
            throw new Error('expected missing author email');
        }, err => {
            err.name.should.eql('GitAuthError');
        });
    });

    it('replaces existing git remote credentials when dangerously authenticating', function () {
        const commandsSeen = [];
        const git = new qiniu.sandbox.Git({
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                if (cmd.indexOf('remote get-url') >= 0) {
                    return Promise.resolve({
                        stdout: 'https://old:secret@example.com/acme/repo.git\n',
                        stderr: '',
                        exitCode: 0
                    });
                }
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
            }
        });

        return git.dangerouslyAuthenticate('/repo', 'origin', 'new user', 'new/pass').then(() => {
            commandsSeen[1].cmd.should.eql('git remote set-url \'origin\' \'https://new%20user:new%2Fpass@example.com/acme/repo.git\'');
            commandsSeen[1].cmd.should.not.containEql('old:secret');
        });
    });

    it('replaces token-only git remote credentials when dangerously authenticating', function () {
        const commandsSeen = [];
        const git = new qiniu.sandbox.Git({
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                if (cmd.indexOf('remote get-url') >= 0) {
                    return Promise.resolve({
                        stdout: 'https://old-token@example.com/acme/repo.git\n',
                        stderr: '',
                        exitCode: 0
                    });
                }
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
            }
        });

        return git.dangerouslyAuthenticate('/repo', 'origin', 'new user', 'new/pass').then(() => {
            commandsSeen[1].cmd.should.eql('git remote set-url \'origin\' \'https://new%20user:new%2Fpass@example.com/acme/repo.git\'');
            commandsSeen[1].cmd.should.not.containEql('old-token@');
        });
    });

    it('keeps original git push error without credential cleanup', function () {
        const commandsSeen = [];
        const git = new qiniu.sandbox.Git({
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                if (cmd.indexOf(' push ') >= 0) {
                    return Promise.reject(new Error('push failed'));
                }
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
            }
        });

        return git.push('/repo', {
            username: 'u',
            password: 'p',
            remote: 'origin',
            branch: 'main'
        }).then(() => {
            throw new Error('expected git push to fail');
        }, err => {
            err.message.should.eql('push failed');
            commandsSeen.length.should.eql(1);
            commandsSeen[0].cmd.should.containEql('credential.helper=');
            commandsSeen[0].cmd.should.containEql('push \'origin\' \'main\'');
            commandsSeen[0].cmd.should.not.containEql('remote set-url');
        });
    });

    it('normalizes git config helpers when options are omitted', function () {
        const commandsSeen = [];
        let missingConfig = false;
        const git = new qiniu.sandbox.Git({
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                if (missingConfig && cmd.indexOf(' config --get ') >= 0) {
                    return Promise.resolve({ stdout: '', stderr: '', exitCode: 1 });
                }
                return Promise.resolve({ stdout: 'Alice\n', stderr: '', exitCode: 0 });
            }
        });

        return git.setConfig('user.name', 'Alice')
            .then(() => git.getConfig('user.name'))
            .then(value => {
                value.should.eql('Alice');
                return git.configureUser('Alice', 'alice@example.com');
            })
            .then(() => {
                missingConfig = true;
                return git.getConfig('missing.name');
            })
            .then(value => {
                should.not.exist(value);
            })
            .then(() => {
                const shellQuote = require('../qiniu/sandbox/util').shellQuote;
                commandsSeen.map(item => item.cmd).should.eql([
                    'git config ' + shellQuote('user.name') + ' ' + shellQuote('Alice'),
                    'git config --get ' + shellQuote('user.name'),
                    'git config ' + shellQuote('user.name') + ' ' + shellQuote('Alice'),
                    'git config ' + shellQuote('user.email') + ' ' + shellQuote('alice@example.com'),
                    'git config --get ' + shellQuote('missing.name')
                ]);
                commandsSeen.forEach(item => {
                    should.not.exist(item.opts.cwd);
                });
            });
    });

    it('supports E2B style git option signatures for config and restore helpers', function () {
        const commandsSeen = [];
        const git = new qiniu.sandbox.Git({
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                return Promise.resolve({ stdout: 'Alice\n', stderr: '', exitCode: 0 });
            }
        });

        return git.setConfig('user.name', 'Alice', {
            path: '/repo',
            scope: 'local'
        }).then(() => git.getConfig('user.name', {
            path: '/repo',
            scope: 'local'
        })).then(value => {
            value.should.eql('Alice');
            return git.configureUser('Alice', 'alice@example.com', {
                path: '/repo',
                scope: 'local'
            });
        }).then(() => git.reset('/repo', {
            mode: 'hard',
            target: 'HEAD~1'
        })).then(() => git.restore('/repo', {
            paths: ['a.txt']
        })).then(() => {
            commandsSeen.map(item => item.cmd).should.eql([
                'git config --local \'user.name\' \'Alice\'',
                'git config --local --get \'user.name\'',
                'git config --local \'user.name\' \'Alice\'',
                'git config --local \'user.email\' \'alice@example.com\'',
                'git reset --hard \'HEAD~1\'',
                'git restore --worktree -- \'a.txt\''
            ]);
            commandsSeen.every(item => item.opts.cwd === '/repo').should.eql(true);
        });
    });

    it('keeps legacy git configureUser repo path when delegating to config helpers', function () {
        const commandsSeen = [];
        const git = new qiniu.sandbox.Git({
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
            }
        });

        return git.configureUser('/repo', 'Alice', 'alice@example.com', {
            config: {
                'http.version': 'HTTP/1.1'
            }
        }).then(result => {
            result.exitCode.should.eql(0);
            commandsSeen.map(item => item.cmd).should.eql([
                'git -c \'http.version=HTTP/1.1\' config \'user.name\' \'Alice\'',
                'git -c \'http.version=HTTP/1.1\' config \'user.email\' \'alice@example.com\''
            ]);
            commandsSeen.every(item => item.opts.cwd === '/repo').should.eql(true);
        });
    });
});
