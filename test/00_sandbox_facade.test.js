const {
    qiniu,
    startServer,
    closeServer
} = require('./sandbox_helpers');

describe('test sandbox facade module', function () {
    it('covers Sandbox.connect, Sandbox.list, wait polling, and stopped health checks', function () {
        let infoCalls = 0;
        return startServer((req, res) => {
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'POST' && req.url === '/sandboxes/sbx_9/connect') {
                res.statusCode = 200;
                res.end(JSON.stringify({ sandboxID: 'sbx_9', domain: 'd.example.com', envdAccessToken: 'token' }));
                return;
            }
            if (req.method === 'GET' && req.url === '/v2/sandboxes?limit=1') {
                res.statusCode = 200;
                res.end(JSON.stringify([{ sandboxID: 'sbx_9', domain: 'd.example.com', envdAccessToken: 'token' }]));
                return;
            }
            if (req.method === 'POST' && req.url === '/sandboxes') {
                res.statusCode = 201;
                res.end(JSON.stringify({ sandboxID: 'sbx_10', envdAccessToken: 'token' }));
                return;
            }
            if (req.method === 'GET' && req.url === '/sandboxes/sbx_10') {
                infoCalls += 1;
                res.statusCode = 200;
                res.end(JSON.stringify({ sandboxID: 'sbx_10', state: infoCalls > 1 ? 'running' : 'pending' }));
                return;
            }
            if (req.method === 'GET' && req.url === '/health') {
                res.statusCode = 502;
                res.end(JSON.stringify({ message: 'stopped' }));
                return;
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ message: req.method + ' ' + req.url }));
        }).then(fixture => {
            const client = new qiniu.sandbox.SandboxClient({
                apiKey: 'sandbox-key',
                endpoint: fixture.endpoint
            });

            return qiniu.sandbox.Sandbox.connect('sbx_9', {
                client,
                timeout: 12
            }).then(sandbox => {
                sandbox.sandboxId.should.eql('sbx_9');
                sandbox.envdAccessToken.should.eql('token');
                return qiniu.sandbox.Sandbox.list({ client, limit: 1 });
            }).then(sandboxes => {
                sandboxes[0].sandboxId.should.eql('sbx_9');
                return client.createAndWait({ template: 'base' }, { intervalMs: 1, timeoutMs: 100 });
            }).then(sandbox => {
                sandbox.sandboxId.should.eql('sbx_10');
                sandbox.envdAccessToken.should.eql('token');
                infoCalls.should.eql(2);
                const stopped = new qiniu.sandbox.Sandbox({
                    sandboxId: 'sbx_11',
                    envdUrl: fixture.endpoint,
                    info: {}
                });
                return stopped.isRunning();
            }).then(running => {
                running.should.eql(false);
                return closeServer(fixture.server);
            }, err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('retries transient waitForReady polling errors before timeout', function () {
        let infoCalls = 0;
        return startServer((req, res) => {
            if (req.method === 'GET' && req.url === '/sandboxes/sbx_retry') {
                infoCalls += 1;
                if (infoCalls === 1) {
                    res.statusCode = 502;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ message: 'temporary' }));
                    return;
                }
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ sandboxID: 'sbx_retry', state: 'running' }));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_retry',
                client: new qiniu.sandbox.SandboxClient({
                    endpoint: fixture.endpoint,
                    apiKey: 'sandbox-key'
                }),
                info: {}
            });

            return sandbox.waitForReady({
                intervalMs: 1,
                timeoutMs: 50
            }).then(info => {
                info.state.should.eql('running');
                infoCalls.should.eql(2);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('treats waitForReady timeout alias as seconds while polling', function () {
        let infoCalls = 0;
        return startServer((req, res) => {
            if (req.method === 'GET' && req.url === '/sandboxes/sbx_poll_seconds') {
                infoCalls += 1;
                if (infoCalls === 1) {
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ sandboxID: 'sbx_poll_seconds', state: 'starting' }));
                    return;
                }
                setTimeout(() => {
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ sandboxID: 'sbx_poll_seconds', state: 'running' }));
                }, 20);
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_poll_seconds',
                client: new qiniu.sandbox.SandboxClient({
                    endpoint: fixture.endpoint,
                    apiKey: 'sandbox-key'
                }),
                info: {}
            });

            return sandbox.waitForReady({
                intervalMs: 1,
                timeout: 1
            }).then(info => {
                info.state.should.eql('running');
                infoCalls.should.eql(2);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('does not retry fatal client errors while polling', function () {
        let calls = 0;
        return startServer((req, res) => {
            calls += 1;
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ message: 'missing' }));
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_missing',
                client: new qiniu.sandbox.SandboxClient({
                    endpoint: fixture.endpoint,
                    apiKey: 'sandbox-key'
                }),
                info: {}
            });

            return sandbox.waitForReady({ intervalMs: 1, timeoutMs: 100 }).then(() => {
                throw new Error('expected waitForReady to fail');
            }, err => {
                err.response.statusCode.should.eql(404);
                calls.should.eql(1);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('does not retry programming errors while polling', function () {
        let calls = 0;
        const sandbox = new qiniu.sandbox.Sandbox({
            sandboxId: 'sbx_programming_error',
            info: {}
        });
        sandbox.getInfo = function () {
            calls += 1;
            return Promise.reject(new TypeError('bad poll logic'));
        };

        return sandbox.waitForReady({ intervalMs: 1, timeoutMs: 100 }).then(() => {
            throw new Error('expected waitForReady to fail');
        }, err => {
            err.message.should.eql('bad poll logic');
            calls.should.eql(1);
        });
    });

    it('returns false for transient envd gateway health errors and rethrows others', function () {
        let calls = 0;
        return startServer((req, res) => {
            calls += 1;
            if (calls === 1) {
                res.statusCode = 503;
                res.end('starting');
                return;
            }
            if (calls === 2) {
                res.statusCode = 504;
                res.end('timeout');
                return;
            }
            res.statusCode = 500;
            res.end('broken');
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_health_error',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.isRunning().then(running => {
                running.should.eql(false);
                return sandbox.isRunning();
            }).then(running => {
                running.should.eql(false);
                return sandbox.isRunning();
            }).then(() => {
                throw new Error('expected health error');
            }, err => {
                err.name.should.eql('SandboxError');
                err.message.should.containEql('500');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('returns false from isRunning on connection failures', function () {
        const sandbox = new qiniu.sandbox.Sandbox({
            sandboxId: 'sbx_down',
            envdUrl: 'http://127.0.0.1:9',
            info: {}
        });

        return sandbox.isRunning().then(running => {
            running.should.eql(false);
        });
    });
});
