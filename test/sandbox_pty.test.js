const {
    should,
    qiniu,
    startServer,
    closeServer,
    decodeConnectEnvelope,
    encodeConnectEnvelope,
    encodeRawConnectEnvelope,
    encodeConnectEndEnvelope,
    encodeOversizedConnectHeader,
    encodeTruncatedConnectHeader
} = require('./sandbox_helpers');

describe('test sandbox pty module', function () {
    it('supports E2B style PTY connect, input, resize, and kill operations', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start' || req.url === '/process.Process/Connect') {
                const body = decodeConnectEnvelope(req.rawBody);
                if (req.url === '/process.Process/Start') {
                    body.pty.size.should.eql({ cols: 80, rows: 24 });
                    body.process.envs.TERM.should.eql('xterm-256color');
                } else {
                    body.process.selector.pid.should.eql(44);
                }
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 44 } } }),
                    encodeConnectEnvelope({ event: { data: { pty: Buffer.from('ok').toString('base64') } } }),
                    encodeConnectEnvelope({ event: { end: { exitCode: 0 } } })
                ]));
                return;
            }
            if (req.url === '/process.Process/SendInput' || req.url === '/process.Process/Update' || req.url === '/process.Process/SendSignal') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end('{}');
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_pty',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });
            const data = [];

            return sandbox.pty.create({
                cols: 80,
                rows: 24,
                user: 'root',
                requestTimeoutMs: 1000,
                onData: chunk => data.push(Buffer.from(chunk).toString())
            }).then(handle => {
                handle.pid.should.eql(44);
                return handle.kill().then(killed => {
                    killed.should.eql(true);
                    fixture.requests[1].headers.authorization.should.eql('Basic ' + Buffer.from('root:').toString('base64'));
                    return handle.wait();
                });
            }).then(() => sandbox.pty.connect(44, {
                onData: chunk => data.push(Buffer.from(chunk).toString())
            })).then(handle => handle.wait())
                .then(() => sandbox.pty.sendInput(44, 123))
                .then(() => sandbox.pty.resize(44, { cols: 100, rows: 30 }))
                .then(() => sandbox.pty.kill(44))
                .then(killed => {
                    killed.should.eql(true);
                    data.should.eql(['ok', 'ok']);
                    const sendBody = JSON.parse(fixture.requests[3].body);
                    sendBody.input.pty.should.eql(Buffer.from('123').toString('base64'));
                    const resizeBody = JSON.parse(fixture.requests[4].body);
                    resizeBody.pty.size.should.eql({ cols: 100, rows: 30 });
                    const killBody = JSON.parse(fixture.requests[5].body);
                    killBody.signal.should.eql('SIGNAL_SIGKILL');
                }).then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('rejects malformed live PTY stream payloads', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(encodeRawConnectEnvelope('not-json'));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_pty_bad_json',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.pty.create({
                cols: 80,
                rows: 24
            }).then(() => {
                throw new Error('expected pty stream parse error');
            }, err => {
                err.message.should.match(/Unexpected token/);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('uses live PTY creation for default and args-based create calls', function () {
        let starts = 0;
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                starts += 1;
                const body = decodeConnectEnvelope(req.rawBody);
                if (starts === 1) {
                    body.process.cmd.should.eql('/bin/bash');
                    body.process.args.should.eql(['-i', '-l']);
                } else {
                    body.process.cmd.should.eql('node');
                    body.process.args.should.eql(['-i']);
                }
                should.exist(body.pty);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 48 + starts } } }),
                    encodeConnectEnvelope({ event: { end: { exitCode: 0 } } })
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_pty_args',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.pty.create()
                .then(handle => handle.wait())
                .then(() => sandbox.pty.create({ cmd: 'node', args: ['-i'] }))
                .then(handle => handle.wait())
                .then(result => {
                    result.exitCode.should.eql(0);
                    starts.should.eql(2);
                })
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('rejects PTY wait when Connect end-stream carries an error', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 45 } } }),
                    encodeConnectEndEnvelope({ error: { code: 'internal', message: 'pty failed' } })
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_pty_trailer',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.pty.create({
                cols: 80,
                rows: 24
            }).then(handle => {
                handle.pid.should.eql(45);
                return handle.wait();
            }).then(() => {
                throw new Error('expected pty wait to reject');
            }, err => {
                err.message.should.eql('pty failed');
                err.code.should.eql('internal');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('rejects PTY wait when the live Connect stream ends with a partial frame after start', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 46 } } }),
                    encodeTruncatedConnectHeader()
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_pty_truncated_tail',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.pty.create({
                cols: 80,
                rows: 24
            }).then(handle => {
                handle.pid.should.eql(46);
                return handle.wait();
            }).then(() => {
                throw new Error('expected pty wait to reject');
            }, err => {
                err.message.should.eql('Sandbox envd stream truncated unexpectedly');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('rejects PTY wait when the live Connect stream ends before process end', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(encodeConnectEnvelope({ event: { start: { pid: 47 } } }));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_pty_missing_end',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.pty.create({
                cols: 80,
                rows: 24
            }).then(handle => {
                handle.pid.should.eql(47);
                return handle.wait();
            }).then(() => {
                throw new Error('expected pty wait to reject');
            }, err => {
                err.message.should.eql('PTY stream ended before process end');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('does not reject PTY wait after disconnecting the live stream', function () {
        let ptyResponse;
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                ptyResponse = res;
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.write(encodeConnectEnvelope({ event: { start: { pid: 48 } } }));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_pty_disconnect',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.pty.create({
                cols: 80,
                rows: 24
            }).then(handle => {
                return handle.disconnect()
                    .then(() => handle.wait())
                    .then(result => {
                        result.exitCode.should.eql(0);
                    });
            }).then(() => {
                if (ptyResponse) {
                    ptyResponse.end();
                }
                return closeServer(fixture.server);
            }, err => {
                if (ptyResponse) {
                    ptyResponse.end();
                }
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('rejects oversized PTY stream envelopes', function () {
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
                sandboxId: 'sbx_pty_huge',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.pty.create({
                cols: 80,
                rows: 24
            }).then(() => {
                throw new Error('expected pty stream to reject oversized frame');
            }, err => {
                err.message.should.containEql('envelope too large');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('rejects live PTY start when the process stream does not start before timeout', function () {
        let ptyResponse;
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                ptyResponse = res;
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_pty_timeout',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.pty.create({
                cols: 80,
                rows: 24,
                requestTimeoutMs: 5
            }).then(() => {
                throw new Error('expected pty start to time out');
            }, err => {
                err.message.should.eql('PTY stream start timed out');
                if (ptyResponse) {
                    ptyResponse.end();
                }
            }).then(() => closeServer(fixture.server), err => {
                if (ptyResponse) {
                    ptyResponse.end();
                }
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('treats PTY timeout alias as seconds while waiting for stream start', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                setTimeout(() => {
                    res.end(Buffer.concat([
                        encodeConnectEnvelope({ event: { start: { pid: 47 } } }),
                        encodeConnectEnvelope({ event: { end: { exitCode: 0 } } })
                    ]));
                }, 20);
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_pty_timeout_seconds',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.pty.create({
                cols: 80,
                rows: 24,
                timeout: 1
            }).then(handle => {
                handle.pid.should.eql(47);
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

    it('returns false for PTY kill 404 responses and rethrows other failures', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/SendSignal') {
                const body = JSON.parse(req.body);
                if (body.process.selector.pid === 404) {
                    res.statusCode = 404;
                    res.end('missing');
                    return;
                }
                res.statusCode = 500;
                res.end('boom');
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_pty_kill',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.pty.kill(404)
                .then(killed => {
                    killed.should.eql(false);
                    return sandbox.pty.kill(500);
                })
                .then(() => {
                    throw new Error('expected non-404 PTY kill to reject');
                }, err => {
                    err.name.should.eql('SandboxError');
                    err.message.should.containEql('status 500');
                })
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });
});
