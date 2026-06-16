const {
    should,
    http,
    qiniu,
    startServer,
    closeServer,
    decodeConnectEnvelope,
    encodeConnectEnvelope,
    encodeRawConnectEnvelope,
    encodeConnectEndEnvelope,
    encodeOversizedConnectHeader,
    encodeTruncatedConnectHeader,
    handleGitAndPty
} = require('./sandbox_helpers');

describe('test sandbox commands module', function () {
    it('runs commands and git operations through process RPC', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                const body = decodeConnectEnvelope(req.rawBody);
                body.process.cmd.should.eql('/bin/bash');
                body.process.args.should.eql(['-l', '-c', 'git status --porcelain=v1 -b']);
                body.process.cwd.should.eql('/repo');
                req.headers['content-type'].should.eql('application/connect+json');
                req.headers['keepalive-ping-interval'].should.eql('50');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 101 } } }),
                    encodeConnectEnvelope({ event: { data: { stdout: Buffer.from('## main\n M a.txt\n?? b.txt\n').toString('base64') } } }),
                    encodeConnectEnvelope({ event: { end: { exitCode: 0 } } })
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_6',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.git.status('/repo').then(status => {
                status.currentBranch.should.eql('main');
                status.changedFiles.should.eql(['a.txt']);
                status.untrackedFiles.should.eql(['b.txt']);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('passes git config options to git commands', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                const body = decodeConnectEnvelope(req.rawBody);
                body.process.args.should.eql([
                    '-l',
                    '-c',
                    'git -c \'http.version=HTTP/1.1\' clone \'https://example.com/repo.git\' --depth \'1\' --branch \'main\' \'/repo\''
                ]);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 103 } } }),
                    encodeConnectEnvelope({ event: { end: { exitCode: 0 } } })
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_6c',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.git.clone('https://example.com/repo.git', {
                path: '/repo',
                depth: 1,
                branch: 'main',
                config: {
                    'http.version': 'HTTP/1.1'
                }
            }).then(result => {
                result.exitCode.should.eql(0);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('decodes base64 process byte fields from Connect JSON', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 102 } } }),
                    encodeConnectEnvelope({ event: { data: { stdout: Buffer.from('hello sandbox').toString('base64') } } }),
                    encodeConnectEnvelope({ event: { end: { exitCode: 0 } } })
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_6b',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.commands.run('cat /tmp/hello.txt')
                .then(result => {
                    result.stdout.should.eql('hello sandbox');
                })
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('covers command management, callbacks, background handles, pty, and git wrappers', function () {
        const commandsSeen = [];
        const fakeCommands = {
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                return Promise.resolve({
                    exitCode: 0,
                    stdout: 'value\n',
                    stderr: ''
                });
            },
            start: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                return Promise.resolve({ pid: 9, wait: function () {} });
            }
        };
        const git = new qiniu.sandbox.Git(fakeCommands);

        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 12 } } }),
                    encodeConnectEnvelope({ event: { data: { stdout: [111, 117, 116], stderr: [101, 114, 114] } } }),
                    encodeConnectEnvelope({ event: { end: { exitCode: 2, error: 'boom' } } })
                ]));
                return;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            if (req.url === '/process.Process/List') {
                res.end(JSON.stringify({
                    processes: [
                        { pid: 1, tag: 't', config: { cmd: 'bash', args: ['-l'], envs: { A: '1' }, cwd: '/w' } }
                    ]
                }));
                return;
            }
            res.end('{}');
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_8',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });
            const seen = [];

            return sandbox.commands.run('echo hi', {
                cwd: '/work',
                envs: { A: '1' },
                tag: 'tag1',
                stdin: true,
                onStdout: data => seen.push('out:' + data),
                onStderr: data => seen.push('err:' + data)
            }).then(result => {
                result.exitCode.should.eql(2);
                result.error.should.eql('boom');
                seen.should.eql(['out:out', 'err:err']);
                const firstStartBody = decodeConnectEnvelope(fixture.requests[0].rawBody);
                firstStartBody.process.cwd.should.eql('/work');
                firstStartBody.process.envs.should.eql({ A: '1' });
                firstStartBody.tag.should.eql('tag1');
                firstStartBody.stdin.should.eql(true);
                return sandbox.commands.run('sleep 1', { background: true });
            }).then(handle => {
                handle.pid.should.eql(12);
                return sandbox.commands.list();
            }).then(list => {
                list[0].cwd.should.eql('/w');
                return sandbox.commands.sendStdin(12, Buffer.from('hello'));
            }).then(() => {
                const sendStdinBody = JSON.parse(fixture.requests[3].body);
                sendStdinBody.input.stdin.should.eql(Buffer.from('hello').toString('base64'));
                return sandbox.commands.closeStdin(12);
            })
                .then(() => sandbox.commands.kill(12))
                .then(() => handleGitAndPty(git, sandbox.pty, commandsSeen, fixture))
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('returns command background handles before the process stream ends', function () {
        let commandResponse;
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                commandResponse = res;
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.write(encodeConnectEnvelope({ event: { start: { pid: 88 } } }));
                return;
            }
            if (req.url === '/process.Process/SendSignal') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end('{}');
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_live_cmd',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });
            const seen = [];

            return sandbox.commands.run('sleep 5', {
                background: true,
                user: 'root',
                requestTimeoutMs: 1000,
                onStdout: data => seen.push(data)
            }).then(handle => {
                handle.pid.should.eql(88);
                should.not.exist(handle.result);
                return handle.kill().then(() => handle);
            }).then(handle => {
                fixture.requests[1].headers.authorization.should.eql('Basic ' + Buffer.from('root:').toString('base64'));
                commandResponse.write(encodeConnectEnvelope({
                    event: {
                        data: {
                            stdout: Buffer.from('ready').toString('base64')
                        }
                    }
                }));
                commandResponse.end(encodeConnectEnvelope({ event: { end: { exitCode: 0 } } }));
                return handle.wait();
            }).then(result => {
                result.stdout.should.eql('ready');
                seen.should.eql(['ready']);
            }).then(() => closeServer(fixture.server), err => {
                if (commandResponse) {
                    commandResponse.end();
                }
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('rejects malformed command stream and JSON fallback payloads', function () {
        let calls = 0;
        return startServer((req, res) => {
            calls += 1;
            if (req.url === '/process.Process/Start' && calls === 1) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(encodeRawConnectEnvelope('not-json'));
                return;
            }
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end('not-json');
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_cmd_bad_json',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.commands.start('echo bad').then(() => {
                throw new Error('expected command stream parse error');
            }, err => {
                err.message.should.match(/Unexpected token/);
                return sandbox.commands.start('echo bad');
            }).then(() => {
                throw new Error('expected command JSON fallback parse error');
            }, err => {
                err.message.should.match(/Unexpected token/);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('rejects command wait when Connect end-stream carries an error', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 91 } } }),
                    encodeConnectEndEnvelope({ error: { code: 'internal', message: 'stream failed' } })
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_cmd_trailer',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.commands.start('echo bad').then(handle => {
                handle.pid.should.eql(91);
                return handle.wait();
            }).then(() => {
                throw new Error('expected command wait to reject');
            }, err => {
                err.message.should.eql('stream failed');
                err.code.should.eql('internal');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('rejects oversized command stream envelopes', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(encodeOversizedConnectHeader());
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_cmd_huge',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.commands.start('echo huge').then(() => {
                throw new Error('expected command stream to reject oversized frame');
            }, err => {
                err.message.should.containEql('envelope too large');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('rejects command start when the process stream does not start before timeout', function () {
        let commandResponse;
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                commandResponse = res;
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.flushHeaders();
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_cmd_timeout',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.commands.start('sleep 5', {
                requestTimeoutMs: 5
            }).then(() => {
                throw new Error('expected command start to time out');
            }, err => {
                err.message.should.eql('Command stream start timed out');
                if (commandResponse) {
                    commandResponse.end();
                }
            }).then(() => closeServer(fixture.server), err => {
                if (commandResponse) {
                    commandResponse.end();
                }
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('treats command timeout alias as seconds while waiting for stream start', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                setTimeout(() => {
                    res.end(Buffer.concat([
                        encodeConnectEnvelope({ event: { start: { pid: 81 } } }),
                        encodeConnectEnvelope({ event: { end: { exitCode: 0 } } })
                    ]));
                }, 20);
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_cmd_timeout_seconds',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.commands.start('sleep 1', {
                timeout: 1
            }).then(handle => {
                handle.pid.should.eql(81);
                return handle.wait();
            }).then(result => {
                result.exitCode.should.eql(0);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('does not reject command wait after disconnecting the live stream', function () {
        let commandResponse;
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                commandResponse = res;
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.write(encodeConnectEnvelope({ event: { start: { pid: 83 } } }));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_cmd_disconnect',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.commands.start('sleep 30').then(handle => {
                return handle.disconnect()
                    .then(() => handle.wait())
                    .then(result => {
                        result.exitCode.should.eql(0);
                    });
            }).then(() => {
                if (commandResponse) {
                    commandResponse.end();
                }
                return closeServer(fixture.server);
            }, err => {
                if (commandResponse) {
                    commandResponse.end();
                }
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('rejects command wait when the live Connect stream ends with a partial frame after start', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 82 } } }),
                    encodeTruncatedConnectHeader()
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_cmd_truncated_tail',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.commands.start('echo bad').then(handle => {
                handle.pid.should.eql(82);
                return handle.wait();
            }).then(() => {
                throw new Error('expected command wait to reject');
            }, err => {
                err.message.should.eql('Sandbox envd stream truncated unexpectedly');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('rejects command wait when the live Connect stream ends before process end', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(encodeConnectEnvelope({ event: { start: { pid: 84 } } }));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_cmd_missing_end',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.commands.start('echo bad').then(handle => {
                handle.pid.should.eql(84);
                return handle.wait();
            }).then(() => {
                throw new Error('expected command wait to reject');
            }, err => {
                err.message.should.eql('Command stream ended before process end');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('uses configured HTTP agents for live envd streams', function () {
        const agent = new http.Agent();
        const requestsThroughAgent = [];
        const originalAddRequest = agent.addRequest;
        agent.addRequest = function (req, options) {
            requestsThroughAgent.push(options.path);
            return originalAddRequest.call(this, req, options);
        };

        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 83 } } }),
                    encodeConnectEnvelope({ event: { end: { exitCode: 0 } } })
                ]));
                return;
            }
            if (req.url === '/filesystem.Filesystem/WatchDir') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(encodeConnectEnvelope({ event: { start: {} } }));
                return;
            }
            if (req.url === '/filesystem.Filesystem/Stat') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    result: {
                        entry: { name: 'agent.txt', path: '/agent.txt', type: 'FILE_TYPE_FILE', size: 5 }
                    }
                }));
                return;
            }
            if (req.method === 'GET' && req.url.indexOf('/files') === 0) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/octet-stream');
                res.end('agent');
                return;
            }
            if (req.method === 'POST' && req.url.indexOf('/files') === 0) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify([{ name: 'agent.txt', path: '/agent.txt', type: 'file' }]));
                return;
            }
            if (req.url === '/health') {
                res.statusCode = 204;
                res.end();
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_agent',
                envdUrl: fixture.endpoint,
                httpAgent: agent,
                info: {
                    envdAccessToken: 'token',
                    envdVersion: '0.5.7'
                }
            });

            return sandbox.commands.start('echo ok')
                .then(handle => handle.wait())
                .then(() => sandbox.files.watchDir('/workspace', () => {}, {
                    recursive: true
                }))
                .then(handle => {
                    handle._stopped.should.eql(true);
                    return sandbox.files.getInfo('/agent.txt');
                })
                .then(info => {
                    info.path.should.eql('/agent.txt');
                    return sandbox.files.readText('/agent.txt');
                })
                .then(text => {
                    text.should.eql('agent');
                    return sandbox.files.write('/agent.txt', 'agent');
                })
                .then(info => {
                    info.path.should.eql('/agent.txt');
                    return sandbox.isRunning();
                })
                .then(running => {
                    running.should.eql(true);
                    return sandbox.pty.create({
                        cols: 80,
                        rows: 24
                    });
                })
                .then(handle => handle.wait())
                .then(() => {
                    requestsThroughAgent[0].should.eql('/process.Process/Start');
                    requestsThroughAgent[1].should.eql('/filesystem.Filesystem/WatchDir');
                    requestsThroughAgent[2].should.eql('/filesystem.Filesystem/Stat');
                    requestsThroughAgent[3].should.startWith('/files?path=%2Fagent.txt&username=user&signature=');
                    requestsThroughAgent[4].should.startWith('/files?path=%2Fagent.txt&username=user&signature=');
                    requestsThroughAgent[5].should.eql('/health');
                    requestsThroughAgent[6].should.eql('/process.Process/Start');
                })
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        }).then(result => {
            agent.destroy();
            return result;
        }, err => {
            agent.destroy();
            throw err;
        });
    });

    it('supports JSON fallback for process stream responses and poll timeout errors', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.flushHeaders();
                setTimeout(() => {
                    res.end(JSON.stringify({
                        events: [
                            { event: { start: { pid: 22 } } },
                            { event: { data: { stdout: Buffer.from('ok').toString('base64') } } },
                            { event: { end: { exitCode: 0 } } }
                        ]
                    }));
                }, 20);
                return;
            }
            if (req.url === '/sandboxes/sbx_pending') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ sandboxID: 'sbx_pending', state: 'pending' }));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_pending',
                envdUrl: fixture.endpoint,
                client: new qiniu.sandbox.SandboxClient({
                    endpoint: fixture.endpoint,
                    apiKey: 'sandbox-key'
                }),
                info: {}
            });

            return sandbox.commands.run('echo ok', { timeoutMs: 5 })
                .then(result => {
                    result.stdout.should.eql('ok');
                    return sandbox.waitForReady({ intervalMs: 1, timeoutMs: 5 });
                })
                .then(() => {
                    throw new Error('expected waitForReady timeout');
                }, err => {
                    err.name.should.eql('TimeoutError');
                    err.message.should.eql('Sandbox poll timed out');
                })
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('treats envd RPC timeout alias as seconds', function () {
        const envd = require('../qiniu/sandbox/envd');
        return startServer((req, res) => {
            if (req.url === '/test.RPC/Call') {
                setTimeout(() => {
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ result: { ok: true } }));
                }, 20);
                return;
            }
            if (req.url === '/test.RPC/Stream') {
                setTimeout(() => {
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/connect+json');
                    res.end(encodeConnectEnvelope({ event: { ok: true } }));
                }, 20);
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_envd_timeout_seconds',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return envd.connectRPC(sandbox, '/test.RPC/Call', {}, {
                timeout: 1
            }).then(result => {
                result.should.eql({ ok: true });
                return envd.connectStreamRPC(sandbox, '/test.RPC/Stream', {}, {
                    timeout: 1
                });
            }).then(events => {
                events.should.eql([{ event: { ok: true } }]);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('rejects truncated buffered Connect stream responses', function () {
        try {
            require('../qiniu/sandbox/envd').decodeConnectEnvelopes(encodeTruncatedConnectHeader());
            throw new Error('expected buffered decoder to reject truncated stream');
        } catch (err) {
            err.message.should.eql('Sandbox envd stream truncated unexpectedly');
        }

        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(encodeTruncatedConnectHeader());
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_truncated',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.commands.run('echo bad').then(() => {
                throw new Error('expected truncated stream error');
            }, err => {
                err.message.should.eql('Sandbox envd stream truncated unexpectedly');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('supports process stream JSON array and single event fallback responses', function () {
        let calls = 0;
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                calls += 1;
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                if (calls === 1) {
                    res.end(JSON.stringify([
                        { event: { start: { pid: 31 } } },
                        { event: { data: { stdout: Buffer.from('array').toString('base64') } } },
                        { event: { end: { exitCode: 0 } } }
                    ]));
                    return;
                }
                res.end(JSON.stringify({
                    event: {
                        end: {
                            exitCode: 0
                        }
                    }
                }));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_json_fallback',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.commands.run('echo array')
                .then(result => {
                    result.pid.should.eql(31);
                    result.stdout.should.eql('array');
                    return sandbox.commands.run('true');
                })
                .then(result => {
                    result.exitCode.should.eql(0);
                })
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('supports E2B command timeout aliases and optional exit throwing', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 77 } } }),
                    encodeConnectEnvelope({ event: { data: { stdout: Buffer.from('out').toString('base64'), stderr: Buffer.from('err').toString('base64') } } }),
                    encodeConnectEnvelope({ event: { end: { exitCode: 7 } } })
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_cmd',
                envdUrl: fixture.endpoint,
                envdAccessToken: 'token',
                info: {}
            });

            return sandbox.commands.run('false', {
                requestTimeoutMs: 12000
            }).then(result => {
                result.exitCode.should.eql(7);
                result.stdout.should.eql('out');
                result.stderr.should.eql('err');
                return sandbox.commands.run('false', {
                    requestTimeoutMs: 12000,
                    throwOnError: true
                });
            }).then(() => {
                throw new Error('expected command to throw');
            }, err => {
                err.name.should.eql('CommandExitError');
                err.exitCode.should.eql(7);
                err.stdout.should.eql('out');
                err.stderr.should.eql('err');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('supports commands.connect with E2B style command handle semantics', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Connect') {
                const body = decodeConnectEnvelope(req.rawBody);
                body.process.selector.pid.should.eql(55);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 55 } } }),
                    encodeConnectEnvelope({ event: { data: { stdout: Buffer.from('connected').toString('base64') } } }),
                    encodeConnectEnvelope({ event: { end: { exitCode: 0 } } })
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_connect_cmd',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.commands.connect(55, {
                requestTimeoutMs: 9000
            }).then(handle => {
                handle.pid.should.eql(55);
                return handle.wait();
            }).then(result => {
                result.stdout.should.eql('connected');
                result.exitCode.should.eql(0);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('parses envd stream fallback responses shaped as events, arrays, and single events', function () {
        const envd = require('../qiniu/sandbox/envd');
        return startServer((req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            if (req.url === '/stream.EventsObject') {
                res.end(JSON.stringify({
                    events: [{ event: { start: { pid: 1 } } }]
                }));
                return;
            }
            if (req.url === '/stream.Array') {
                res.end(JSON.stringify([{ event: { end: { exitCode: 0 } } }]));
                return;
            }
            if (req.url === '/stream.Single') {
                res.end(JSON.stringify({ event: { data: { stdout: 'aGVsbG8=' } } }));
                return;
            }
            if (req.url === '/stream.Empty') {
                res.end(JSON.stringify({ ok: true }));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_envd_fallbacks',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return envd.connectStreamRPC(sandbox, '/stream.EventsObject', {})
                .then(events => {
                    events.should.eql([{ event: { start: { pid: 1 } } }]);
                    return envd.connectStreamRPC(sandbox, '/stream.Array', {});
                })
                .then(events => {
                    events.should.eql([{ event: { end: { exitCode: 0 } } }]);
                    return envd.connectStreamRPC(sandbox, '/stream.Single', {});
                })
                .then(events => {
                    events.should.eql([{ event: { data: { stdout: 'aGVsbG8=' } } }]);
                    return envd.connectStreamRPC(sandbox, '/stream.Empty', {});
                })
                .then(events => {
                    events.should.eql([]);
                })
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });
});
