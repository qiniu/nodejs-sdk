const childProcess = require('child_process');
const {
    should,
    qiniu,
    startServer,
    closeServer,
    encodeConnectEnvelope,
    encodeConnectEndEnvelope
} = require('./sandbox_helpers');

function makeSandbox (endpoint) {
    return new qiniu.sandbox.Sandbox({
        sandboxId: 'native-execution-deadline',
        envdUrl: endpoint,
        info: { envdAccessToken: 'token' }
    });
}

function start (sandbox, kind, options) {
    return kind === 'commands'
        ? sandbox.commands.start('long task', options)
        : sandbox.pty.create(options);
}

describe('test sandbox native process execution deadlines', function () {
    ['commands', 'pty'].forEach(kind => {
        ['connected', 'disconnected', 'network-error'].forEach(mode => {
            it(`preserves the ${kind} server deadline when ${mode}`, function () {
                let child;
                let killTimer;
                let exited;
                let handle;
                let fixture;
                let watchdog;
                const sockets = new Set();
                const cleanup = () => {
                    clearTimeout(watchdog);
                    clearTimeout(killTimer);
                    if (child) child.kill('SIGKILL');
                    if (handle) handle.disconnect();
                    sockets.forEach(socket => socket.destroy());
                    return closeServer(fixture.server);
                };
                return startServer((req, res) => {
                    if (req.url !== '/process.Process/Start') {
                        res.statusCode = 500;
                        res.end('Unexpected client termination request');
                        return;
                    }
                    // Model Envd's process lifetime independently of the HTTP stream.
                    child = childProcess.spawn(process.execPath, ['-e', 'setInterval(function () {}, 1000)']);
                    exited = new Promise(resolve => child.once('exit', (code, signal) => {
                        const result = { exitCode: code === null ? -1 : code, error: signal || '' };
                        if (!res.finished && !(res.socket && res.socket.destroyed)) {
                            res.end(encodeConnectEnvelope({ event: { end: result } }));
                        }
                        resolve(result);
                    }));
                    const timeout = Number(req.headers['connect-timeout-ms']);
                    if (timeout > 0) killTimer = setTimeout(() => child.kill('SIGKILL'), timeout);
                    res.setHeader('Content-Type', 'application/connect+json');
                    res.write(encodeConnectEnvelope({ event: { start: { pid: child.pid } } }));
                    if (mode === 'network-error') setTimeout(() => res.destroy(), 10);
                }).then(serverFixture => {
                    fixture = serverFixture;
                    fixture.server.on('connection', socket => {
                        sockets.add(socket);
                        socket.once('close', () => sockets.delete(socket));
                    });
                    const operation = start(makeSandbox(fixture.endpoint), kind, {
                        executionTimeoutMs: 80,
                        requestTimeoutMs: 1000
                    }).then(startedHandle => {
                        handle = startedHandle;
                        fixture.requests[0].headers['connect-timeout-ms'].should.eql('80');
                        const waiting = handle.wait().then(result => {
                            if (mode === 'network-error') throw new Error('expected stream interruption');
                            if (mode === 'connected') result.exitCode.should.eql(-1);
                        }, err => {
                            if (mode !== 'network-error') throw err;
                            err.message.should.match(/abort|closed/);
                        });
                        return (mode === 'disconnected' ? handle.disconnect() : Promise.resolve())
                            .then(() => Promise.all([waiting, exited]));
                    }).then(results => {
                        results[1].exitCode.should.eql(-1);
                        fixture.requests.length.should.eql(1);
                    });
                    const bounded = new Promise((resolve, reject) => {
                        watchdog = setTimeout(() => reject(new Error('Native deadline fixture did not finish')), 4000);
                    });
                    return Promise.race([operation, bounded]);
                }).then(cleanup, err => {
                    return cleanup().then(() => { throw err; });
                });
            });
        });

        it(`omits explicit zero and preserves default ${kind} execution lifetime`, function () {
            return startServer((req, res) => {
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 12 } } }),
                    encodeConnectEnvelope({ event: { end: { exitCode: 0 } } })
                ]));
            }).then(fixture => {
                const sandbox = makeSandbox(fixture.endpoint);
                return start(sandbox, kind).then(handle => handle.wait())
                    .then(() => start(sandbox, kind, { executionTimeoutMs: 0 }))
                    .then(handle => handle.wait()).then(() => {
                        should.not.exist(fixture.requests[0].headers['connect-timeout-ms']);
                        should.not.exist(fixture.requests[1].headers['connect-timeout-ms']);
                    }).then(() => closeServer(fixture.server), err => {
                        return closeServer(fixture.server).then(() => { throw err; });
                    });
            });
        });

        it(`preserves ${kind} native deadline RPC errors`, function () {
            return startServer((req, res) => {
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 12 } } }),
                    encodeConnectEndEnvelope({ error: { code: 'deadline_exceeded', message: 'deadline reached' } })
                ]));
            }).then(fixture => {
                return start(makeSandbox(fixture.endpoint), kind, { executionTimeoutMs: 10 })
                    .then(handle => handle.wait()).then(() => {
                        throw new Error('expected native deadline error');
                    }, err => {
                        err.code.should.eql('deadline_exceeded');
                        err.message.should.eql('deadline reached');
                        fixture.requests.length.should.eql(1);
                    }).then(() => closeServer(fixture.server), err => {
                        return closeServer(fixture.server).then(() => { throw err; });
                    });
            });
        });

        it(`accepts ${kind} deadlines above the client timer range up to the Connect limit`, function () {
            return startServer((req, res) => {
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: { pid: 12 } } }),
                    encodeConnectEnvelope({ event: { end: { exitCode: 0 } } })
                ]));
            }).then(fixture => {
                const sandbox = makeSandbox(fixture.endpoint);
                return start(sandbox, kind, { executionTimeoutMs: 2147483648 }).then(handle => handle.wait())
                    .then(() => start(sandbox, kind, { executionTimeoutMs: 9999999999 }))
                    .then(handle => handle.wait()).then(() => {
                        fixture.requests[0].headers['connect-timeout-ms'].should.eql('2147483648');
                        fixture.requests[1].headers['connect-timeout-ms'].should.eql('9999999999');
                    }).then(() => closeServer(fixture.server), err => {
                        return closeServer(fixture.server).then(() => { throw err; });
                    });
            });
        });
    });

    it('keeps startup waiting independent of the server execution deadline', function () {
        return startServer((req, res) => {
            res.setHeader('Content-Type', 'application/connect+json');
            res.write(encodeConnectEnvelope({ event: { start: { pid: 12 } } }));
            setTimeout(() => res.end(encodeConnectEnvelope({ event: { end: { exitCode: 0 } } })), 50);
        }).then(fixture => {
            return makeSandbox(fixture.endpoint).commands.start('task', {
                requestTimeoutMs: 20,
                executionTimeoutMs: 100
            }).then(handle => handle.wait()).then(result => {
                result.exitCode.should.eql(0);
                fixture.requests[0].headers['connect-timeout-ms'].should.eql('100');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => { throw err; });
            });
        });
    });

    it('keeps native signal exit results compatible with throwOnError', function () {
        return startServer((req, res) => {
            res.setHeader('Content-Type', 'application/connect+json');
            res.end(Buffer.concat([
                encodeConnectEnvelope({ event: { start: { pid: 12 } } }),
                encodeConnectEnvelope({ event: { end: { exitCode: -1, error: 'signal: killed' } } })
            ]));
        }).then(fixture => {
            return makeSandbox(fixture.endpoint).commands.run('task', {
                executionTimeoutMs: 100,
                throwOnError: true
            }).then(() => { throw new Error('expected signal exit failure'); }, err => {
                err.should.be.instanceOf(qiniu.sandbox.CommandExitError);
                err.exitCode.should.eql(-1);
                err.error.should.eql('signal: killed');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => { throw err; });
            });
        });
    });

    it('rejects invalid process deadlines and rejects deadlines on reconnect before requests', function () {
        return startServer((req, res) => res.end()).then(fixture => {
            const sandbox = makeSandbox(fixture.endpoint);
            const calls = [];
            [-1, 0.5, NaN, Infinity, '1', null].forEach(executionTimeoutMs => {
                calls.push(sandbox.commands.start('task', { executionTimeoutMs }));
                calls.push(sandbox.pty.create({ executionTimeoutMs }));
            });
            [0, 10].forEach(executionTimeoutMs => {
                calls.push(sandbox.commands.connect(12, { executionTimeoutMs }));
                calls.push(sandbox.pty.connect(12, { executionTimeoutMs }));
            });
            const checkedCalls = calls.map(call => call.then(() => {
                throw new Error('expected invalid deadline');
            }, err => {
                err.should.be.instanceOf(TypeError);
                err.message.should.match(/executionTimeoutMs/);
            }));
            [10000000000, Number.MAX_VALUE].forEach(executionTimeoutMs => {
                ['commands', 'pty'].forEach(kind => {
                    checkedCalls.push(start(sandbox, kind, { executionTimeoutMs }).then(() => {
                        throw new Error('expected an out-of-range deadline');
                    }, err => {
                        err.should.be.instanceOf(RangeError);
                        err.message.should.match(/9999999999/);
                    }));
                });
            });
            return Promise.all(checkedCalls).then(() => fixture.requests.length.should.eql(0))
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => { throw err; });
                });
        });
    });
});
