const should = require('should');
const http = require('http');

const qiniu = require('../index');

function startServer (handler) {
    const requests = [];
    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on('data', chunk => {
            chunks.push(chunk);
        });
        req.on('end', () => {
            const rawBody = Buffer.concat(chunks);
            const record = {
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: rawBody.toString(),
                rawBody
            };
            requests.push(record);
            handler(record, res);
        });
    });

    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
            resolve({
                server,
                requests,
                endpoint: `http://127.0.0.1:${server.address().port}`
            });
        });
    });
}

function closeServer (server) {
    return new Promise(resolve => server.close(resolve));
}

function parseUrl (value) {
    return new URL(value, 'http://127.0.0.1');
}

function decodeConnectEnvelope (body) {
    body[0].should.eql(0);
    const length = body.readUInt32BE(1);
    return JSON.parse(body.slice(5, 5 + length).toString());
}

function encodeConnectEnvelope (message) {
    const payload = Buffer.from(JSON.stringify(message));
    const header = Buffer.alloc(5);
    header[0] = 0;
    header.writeUInt32BE(payload.length, 1);
    return Buffer.concat([header, payload]);
}

function encodeRawConnectEnvelope (payload, flags) {
    payload = Buffer.from(payload);
    const header = Buffer.alloc(5);
    header[0] = flags || 0;
    header.writeUInt32BE(payload.length, 1);
    return Buffer.concat([header, payload]);
}

function encodeConnectEndEnvelope (message) {
    return encodeRawConnectEnvelope(JSON.stringify(message || {}), 2);
}

function encodeOversizedConnectHeader () {
    const header = Buffer.alloc(5);
    header[0] = 0;
    header.writeUInt32BE(10 * 1024 * 1024 + 1, 1);
    return header;
}

describe('test sandbox module', function () {
    it('creates sandbox with E2B compatible options and API key auth', function () {
        return startServer((req, res) => {
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                sandboxID: 'sbx_1',
                domain: 'sbx.local',
                envdVersion: '0.0.1',
                envdAccessToken: 'token'
            }));
        }).then(fixture => {
            const client = new qiniu.sandbox.SandboxClient({
                apiKey: 'sandbox-key',
                endpoint: fixture.endpoint
            });

            return client.createSandbox({
                template: 'base',
                timeoutMs: 15000,
                metadata: {
                    user: 'alice'
                },
                envs: {
                    FOO: 'bar'
                },
                injections: [
                    {
                        type: 'qiniu',
                        key: 'value'
                    }
                ]
            }).then(ret => {
                should.equal(ret.sandboxID, 'sbx_1');
                fixture.requests.length.should.eql(1);
                fixture.requests[0].method.should.eql('POST');
                fixture.requests[0].url.should.eql('/sandboxes');
                fixture.requests[0].headers['x-api-key'].should.eql('sandbox-key');
                fixture.requests[0].headers.authorization.should.eql('Bearer sandbox-key');
                fixture.requests[0].headers['content-type'].should.eql('application/json');
                JSON.parse(fixture.requests[0].body).should.eql({
                    templateID: 'base',
                    timeout: 15,
                    metadata: {
                        user: 'alice'
                    },
                    envVars: {
                        FOO: 'bar'
                    },
                    injections: [
                        {
                            type: 'qiniu',
                            key: 'value'
                        }
                    ]
                });
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('passes client timeout to urllib requests and handles empty metrics ids', function () {
        const client = new qiniu.sandbox.SandboxClient({
            endpoint: 'http://sandbox.test',
            apiKey: 'sandbox-key',
            timeout: 1234
        });
        const urls = [];
        client.httpClient.sendRequest = req => {
            urls.push(req.url);
            req.urllibOptions.timeout.should.eql(1234);
            return Promise.resolve({
                ok: () => true,
                data: { ok: true }
            });
        };

        return client.listSandboxes()
            .then(() => client.getSandboxesMetrics())
            .then(() => client.getSandboxesMetrics('sbx_one'))
            .then(() => {
                urls.should.eql([
                    'http://sandbox.test/sandboxes',
                    'http://sandbox.test/sandboxes/metrics?sandbox_ids=',
                    'http://sandbox.test/sandboxes/metrics?sandbox_ids=sbx_one'
                ]);
            });
    });

    it('keeps Qiniu sandbox extensions in create body', function () {
        return startServer((req, res) => {
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                sandboxID: 'sbx_qiniu',
                domain: 'sbx.local',
                envdAccessToken: 'token'
            }));
        }).then(fixture => {
            return qiniu.sandbox.Sandbox.create({
                apiKey: 'sandbox-key',
                endpoint: fixture.endpoint,
                mcp: { enabled: true },
                injections: [{ injectionRuleID: 'rule_1' }],
                resources: [{ type: 'github_repository', url: 'https://github.com/acme/repo' }]
            }).then(() => {
                JSON.parse(fixture.requests[0].body).should.eql({
                    templateID: 'base',
                    mcp: { enabled: true },
                    injections: [{ injectionRuleID: 'rule_1' }],
                    resources: [{ type: 'github_repository', url: 'https://github.com/acme/repo' }]
                });
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('uses Qiniu AK/SK signing when creating sandbox with Kodo resources', function () {
        return startServer((req, res) => {
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                sandboxID: 'sbx_kodo',
                domain: 'sbx.local',
                envdAccessToken: 'token'
            }));
        }).then(fixture => {
            const mac = new qiniu.auth.digest.Mac('ak', 'sk', {
                disableQiniuTimestampSignature: true
            });
            const client = new qiniu.sandbox.SandboxClient({
                endpoint: fixture.endpoint,
                apiKey: 'sandbox-key',
                mac
            });

            return client.createSandbox({
                template: 'base',
                resources: [
                    {
                        type: 'kodo',
                        bucket: 'bucket',
                        mount_path: '/workspace/kodo',
                        read_only: true
                    }
                ]
            }).then(() => {
                should(fixture.requests[0].headers.authorization).startWith('Qiniu ak:');
                should.not.exist(fixture.requests[0].headers['x-api-key']);
                JSON.parse(fixture.requests[0].body).resources[0].type.should.eql('kodo');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('exposes E2B style Sandbox.create and kill helpers', function () {
        return startServer((req, res) => {
            if (req.method === 'POST' && req.url === '/sandboxes') {
                res.statusCode = 201;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    sandboxID: 'sbx_2',
                    domain: 'sbx.local',
                    envdAccessToken: 'token'
                }));
                return;
            }

            if (req.method === 'DELETE' && req.url === '/sandboxes/sbx_2') {
                res.statusCode = 204;
                res.end();
                return;
            }

            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            return qiniu.sandbox.Sandbox.create({
                apiKey: 'sandbox-key',
                endpoint: fixture.endpoint,
                template: 'base'
            }).then(sandbox => {
                sandbox.sandboxId.should.eql('sbx_2');
                return sandbox.kill();
            }).then(() => {
                fixture.requests.map(req => `${req.method} ${req.url}`).should.eql([
                    'POST /sandboxes',
                    'DELETE /sandboxes/sbx_2'
                ]);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('exports E2B style top-level Sandbox and client classes', function () {
        qiniu.Sandbox.should.equal(qiniu.sandbox.Sandbox);
        qiniu.SandboxClient.should.equal(qiniu.sandbox.SandboxClient);
        qiniu.CommandExitError.should.equal(qiniu.sandbox.CommandExitError);
    });

    it('supports Sandbox.create(template, opts) overload', function () {
        return startServer((req, res) => {
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                sandboxID: 'sbx_template',
                domain: 'sbx.local',
                envdAccessToken: 'token'
            }));
        }).then(fixture => {
            return qiniu.sandbox.Sandbox.create('nodejs', {
                apiKey: 'sandbox-key',
                endpoint: fixture.endpoint,
                metadata: {
                    source: 'e2b-overload'
                }
            }).then(sandbox => {
                sandbox.sandboxId.should.eql('sbx_template');
                JSON.parse(fixture.requests[0].body).should.eql({
                    templateID: 'nodejs',
                    metadata: {
                        source: 'e2b-overload'
                    }
                });
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('exposes typed sandbox compatibility errors', function () {
        const err = new qiniu.sandbox.CommandExitError({
            command: 'false',
            exitCode: 1,
            stdout: 'out',
            stderr: 'err'
        });

        err.should.be.instanceOf(Error);
        err.name.should.eql('CommandExitError');
        err.exitCode.should.eql(1);
        err.stdout.should.eql('out');
        err.stderr.should.eql('err');
        new qiniu.sandbox.GitAuthError('bad credentials').name.should.eql('GitAuthError');
        new qiniu.sandbox.GitUpstreamError('missing upstream').name.should.eql('GitUpstreamError');
        new qiniu.sandbox.NotImplementedError('volume').name.should.eql('NotImplementedError');
    });

    it('uses Qiniu AK/SK signing for injection rule APIs', function () {
        return startServer((req, res) => {
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                id: 'rule_1',
                name: 'openai',
                injection: {
                    type: 'openai',
                    apiKey: 'secret'
                }
            }));
        }).then(fixture => {
            const mac = new qiniu.auth.digest.Mac('ak', 'sk', {
                disableQiniuTimestampSignature: true
            });
            const client = new qiniu.sandbox.SandboxClient({
                mac,
                endpoint: fixture.endpoint
            });

            return client.createInjectionRule({
                name: 'openai',
                injection: {
                    type: 'openai',
                    apiKey: 'secret'
                }
            }).then(() => {
                fixture.requests[0].method.should.eql('POST');
                fixture.requests[0].url.should.eql('/injection-rules');
                should(fixture.requests[0].headers.authorization).startWith('Qiniu ak:');
                should.not.exist(fixture.requests[0].headers['x-api-key']);
                JSON.parse(fixture.requests[0].body).should.eql({
                    name: 'openai',
                    injection: {
                        type: 'openai',
                        api_key: 'secret'
                    }
                });
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('builds envd hosts and signed file urls', function () {
        const sandbox = new qiniu.sandbox.Sandbox({
            sandboxId: 'sbx_3',
            info: {
                domain: 'sandbox.example.com',
                envdAccessToken: 'token'
            }
        });

        sandbox.getHost(8080).should.eql('8080-sbx_3.sandbox.example.com');

        const parsed = parseUrl(sandbox.downloadUrl('/home/user/a.txt', {
            user: 'admin',
            signatureExpiration: 60
        }));
        parsed.protocol.should.eql('https:');
        parsed.host.should.eql('49983-sbx_3.sandbox.example.com');
        parsed.pathname.should.eql('/files');
        parsed.searchParams.get('path').should.eql('/home/user/a.txt');
        parsed.searchParams.get('username').should.eql('admin');
        parsed.searchParams.get('signature_expiration').should.eql('60');
        should(parsed.searchParams.get('signature')).startWith('v1_');
    });

    it('reads and writes files through envd HTTP API', function () {
        return startServer((req, res) => {
            const parsed = parseUrl(req.url);
            if (req.method === 'GET' && parsed.pathname === '/files') {
                parsed.searchParams.get('path').should.eql('/hello.txt');
                parsed.searchParams.get('username').should.eql('user');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/plain');
                res.end('hello');
                return;
            }

            if (req.method === 'POST' && parsed.pathname === '/files') {
                parsed.searchParams.get('path').should.eql('/hello.txt');
                should(req.headers['content-type']).startWith('multipart/form-data; boundary=');
                req.body.should.containEql('hello');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify([{ name: 'hello.txt', path: '/hello.txt', type: 'file' }]));
                return;
            }

            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_4',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.files.readText('/hello.txt').then(text => {
                text.should.eql('hello');
                return sandbox.files.write('/hello.txt', 'hello');
            }).then(info => {
                info.path.should.eql('/hello.txt');
                fixture.requests.map(req => `${req.method} ${parseUrl(req.url).pathname}`).should.eql([
                    'GET /files',
                    'POST /files'
                ]);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('reads files as text, bytes, blob, and stream formats', function () {
        return startServer((req, res) => {
            const parsed = parseUrl(req.url);
            if (req.method === 'GET' && parsed.pathname === '/files') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/octet-stream');
                res.end(Buffer.from('hello'));
                return;
            }

            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_files',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.files.read('/tmp/a.txt')
                .then(text => {
                    text.should.eql('hello');
                    return sandbox.files.read('/tmp/a.txt', { format: 'bytes' });
                })
                .then(bytes => {
                    Buffer.isBuffer(bytes).should.eql(true);
                    bytes.toString().should.eql('hello');
                    return sandbox.files.read('/tmp/a.txt', { format: 'stream' });
                })
                .then(stream => {
                    (typeof stream.pipe).should.eql('function');
                    return new Promise((resolve, reject) => {
                        const chunks = [];
                        stream.on('data', chunk => chunks.push(chunk));
                        stream.on('end', () => resolve(Buffer.concat(chunks).toString()));
                        stream.on('error', reject);
                    });
                })
                .then(streamText => {
                    streamText.should.eql('hello');
                    return sandbox.files.read('/tmp/a.txt', { format: 'blob' });
                })
                .then(blob => {
                    if (typeof global.Blob !== 'undefined') {
                        blob.should.be.instanceOf(global.Blob);
                    } else {
                        Buffer.isBuffer(blob).should.eql(true);
                    }
                })
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('uses Connect RPC paths for filesystem metadata operations', function () {
        return startServer((req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            if (req.url === '/filesystem.Filesystem/Stat') {
                res.end(JSON.stringify({
                    entry: { name: 'hello.txt', path: '/hello.txt', type: 'FILE_TYPE_FILE', size: 5 }
                }));
                return;
            }
            if (req.url === '/filesystem.Filesystem/ListDir') {
                res.end(JSON.stringify({
                    entries: [{ name: 'hello.txt', path: '/hello.txt', type: 'FILE_TYPE_FILE', size: 5 }]
                }));
                return;
            }
            if (req.url === '/filesystem.Filesystem/MakeDir') {
                res.end(JSON.stringify({
                    entry: { name: 'tmp', path: '/tmp', type: 'FILE_TYPE_DIRECTORY' }
                }));
                return;
            }
            if (req.url === '/filesystem.Filesystem/Move') {
                res.end(JSON.stringify({
                    entry: { name: 'b.txt', path: '/b.txt', type: 'FILE_TYPE_FILE' }
                }));
                return;
            }
            if (req.url === '/filesystem.Filesystem/Remove') {
                res.end('{}');
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_5',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.files.getInfo('/hello.txt')
                .then(info => {
                    info.type.should.eql('file');
                    return sandbox.files.list('/');
                })
                .then(entries => {
                    entries[0].name.should.eql('hello.txt');
                    return sandbox.files.makeDir('/tmp');
                })
                .then(info => {
                    info.type.should.eql('dir');
                    return sandbox.files.rename('/a.txt', '/b.txt');
                })
                .then(info => {
                    info.path.should.eql('/b.txt');
                    return sandbox.files.remove('/b.txt');
                })
                .then(() => {
                    fixture.requests.map(req => req.url).should.eql([
                        '/filesystem.Filesystem/Stat',
                        '/filesystem.Filesystem/ListDir',
                        '/filesystem.Filesystem/MakeDir',
                        '/filesystem.Filesystem/Move',
                        '/filesystem.Filesystem/Remove'
                    ]);
                    fixture.requests[0].headers.authorization.should.eql('Basic dXNlcjo=');
                    fixture.requests[0].headers['x-access-token'].should.eql('token');
                }).then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('watches directory changes and returns a stoppable handle after start event', function () {
        let watchResponse;
        return startServer((req, res) => {
            if (req.url === '/filesystem.Filesystem/WatchDir') {
                const body = decodeConnectEnvelope(req.rawBody);
                body.path.should.eql('/workspace');
                body.recursive.should.eql(true);
                req.headers['content-type'].should.eql('application/connect+json');
                req.headers['keepalive-ping-interval'].should.eql('50');
                watchResponse = res;
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.write(encodeConnectEnvelope({ event: { start: {} } }));
                setTimeout(() => {
                    res.write(encodeConnectEnvelope({
                        event: {
                            filesystem: {
                                name: 'created.txt',
                                type: 'EVENT_TYPE_CREATE'
                            }
                        }
                    }));
                    res.write(encodeConnectEnvelope({
                        event: {
                            filesystem: {
                                name: 'written.txt',
                                type: 2
                            }
                        }
                    }));
                    res.write(encodeConnectEnvelope({ event: { keepalive: {} } }));
                }, 10);
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const events = [];
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_watch',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token',
                    envdVersion: '0.5.7'
                }
            });

            return sandbox.files.watchDir('/workspace', event => {
                events.push(event);
            }, {
                recursive: true,
                requestTimeoutMs: 1000
            }).then(handle => {
                (typeof handle.stop).should.eql('function');
                return new Promise(resolve => setTimeout(resolve, 40)).then(() => {
                    events.should.eql([
                        { name: 'created.txt', type: qiniu.sandbox.FilesystemEventType.CREATE },
                        { name: 'written.txt', type: qiniu.sandbox.FilesystemEventType.WRITE }
                    ]);
                    return handle.stop();
                });
            }).then(() => {
                if (watchResponse) {
                    watchResponse.end();
                }
                return closeServer(fixture.server);
            }, err => {
                if (watchResponse) {
                    watchResponse.end();
                }
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('rejects recursive directory watching on envd versions without support', function () {
        const sandbox = new qiniu.sandbox.Sandbox({
            sandboxId: 'sbx_old_watch',
            envdUrl: 'http://127.0.0.1:9',
            info: {
                envdVersion: '0.1.3'
            }
        });

        return sandbox.files.watchDir('/workspace', () => {}, {
            recursive: true
        }).then(() => {
            throw new Error('expected watchDir to reject');
        }, err => {
            err.message.should.match(/recursive watching/i);
        });
    });

    it('returns false from exists for err.resp 404 responses', function () {
        const sandbox = new qiniu.sandbox.Sandbox({
            sandboxId: 'sbx_exists_resp',
            envdUrl: 'http://127.0.0.1:9',
            info: {}
        });
        sandbox.files.getInfo = function () {
            const err = new Error('missing');
            err.resp = { statusCode: 404 };
            return Promise.reject(err);
        };
        return sandbox.files.exists('/missing').then(exists => {
            exists.should.eql(false);
        });
    });

    it('rejects malformed filesystem watch stream payloads', function () {
        return startServer((req, res) => {
            if (req.url === '/filesystem.Filesystem/WatchDir') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: {} } }),
                    encodeRawConnectEnvelope('not-json')
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_watch_bad_json',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token',
                    envdVersion: '0.5.7'
                }
            });
            let handle;

            return sandbox.files.watchDir('/workspace', () => {}, {
                recursive: true,
                onExit: err => {
                    err.message.should.match(/Unexpected token/);
                }
            }).then(ret => {
                handle = ret;
                return new Promise(resolve => setTimeout(resolve, 20));
            }).then(() => {
                handle._stopped.should.eql(true);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('rejects oversized filesystem watch stream envelopes', function () {
        return startServer((req, res) => {
            if (req.url === '/filesystem.Filesystem/WatchDir') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(encodeOversizedConnectHeader());
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_watch_huge',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token',
                    envdVersion: '0.5.7'
                }
            });

            return sandbox.files.watchDir('/workspace', () => {}, {
                recursive: true
            }).then(() => {
                throw new Error('expected watchDir to reject oversized frame');
            }, err => {
                err.message.should.containEql('envelope too large');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

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

    it('maps sandbox lifecycle and metrics APIs', function () {
        return startServer((req, res) => {
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'GET' && req.url === '/v2/sandboxes?metadata=user%3Dalice&state=running%2Cpaused&limit=10&nextToken=n1') {
                res.statusCode = 200;
                res.end(JSON.stringify([{ sandboxID: 'sbx_1' }]));
                return;
            }
            if (req.method === 'GET' && req.url === '/sandboxes/sbx_1') {
                res.statusCode = 200;
                res.end(JSON.stringify({ sandboxID: 'sbx_1', state: 'running' }));
                return;
            }
            if (req.method === 'POST' && req.url === '/sandboxes/sbx_1/connect') {
                res.statusCode = 200;
                res.end(JSON.stringify({ sandboxID: 'sbx_1', envdAccessToken: 'token' }));
                return;
            }
            if (req.method === 'POST' && req.url === '/sandboxes/sbx_1/timeout') {
                res.statusCode = 204;
                res.end();
                return;
            }
            if (req.method === 'POST' && req.url === '/sandboxes/sbx_1/refreshes') {
                res.statusCode = 204;
                res.end();
                return;
            }
            if (req.method === 'POST' && req.url === '/sandboxes/sbx_1/pause') {
                res.statusCode = 204;
                res.end();
                return;
            }
            if (req.method === 'GET' && req.url === '/sandboxes/sbx_1/metrics?start=1&end=2') {
                res.statusCode = 200;
                res.end(JSON.stringify([{ cpuCount: 1 }]));
                return;
            }
            if (req.method === 'GET' && req.url === '/sandboxes/sbx_1/logs?start=10&limit=20') {
                res.statusCode = 200;
                res.end(JSON.stringify({ logs: [] }));
                return;
            }
            if (req.method === 'GET' && req.url === '/sandboxes/metrics?sandbox_ids=sbx_1%2Csbx_2') {
                res.statusCode = 200;
                res.end(JSON.stringify({ sandboxes: [] }));
                return;
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ message: req.method + ' ' + req.url }));
        }).then(fixture => {
            const client = new qiniu.sandbox.SandboxClient({
                apiKey: 'sandbox-key',
                endpoint: fixture.endpoint
            });

            return client.list({
                metadata: 'user=alice',
                state: ['running', 'paused'],
                limit: 10,
                nextToken: 'n1'
            }).then(() => client.getInfo('sbx_1'))
                .then(() => client.connect('sbx_1', { timeoutMs: 20000 }))
                .then(() => client.setTimeout('sbx_1', { timeoutMs: 30000 }))
                .then(() => client.refreshSandbox('sbx_1', { duration: 60 }))
                .then(() => client.pauseSandbox('sbx_1'))
                .then(() => client.getMetrics('sbx_1', { start: 1, end: 2 }))
                .then(() => client.getLogs('sbx_1', { start: 10, limit: 20 }))
                .then(() => client.getSandboxesMetrics(['sbx_1', 'sbx_2']))
                .then(() => {
                    JSON.parse(fixture.requests[3].body).should.eql({ timeout: 30 });
                    JSON.parse(fixture.requests[4].body).should.eql({ duration: 60 });
                    fixture.requests.every(req => req.headers['x-api-key'] === 'sandbox-key').should.eql(true);
                    fixture.requests.every(req => req.headers.authorization === 'Bearer sandbox-key').should.eql(true);
                }).then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('surfaces sandbox API string errors and default connect timeout', function () {
        return startServer((req, res) => {
            if (req.method === 'POST' && req.url === '/sandboxes/sbx_default/connect') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ sandboxID: 'sbx_default' }));
                return;
            }
            res.statusCode = 418;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify('teapot'));
        }).then(fixture => {
            const client = new qiniu.sandbox.SandboxClient({
                endpoint: fixture.endpoint,
                apiKey: 'sandbox-key'
            });

            return client.connectSandbox('sbx_default')
                .then(() => client.getSandbox('sbx_error'))
                .then(() => {
                    throw new Error('expected string error');
                }, err => {
                    JSON.parse(fixture.requests[0].body).should.eql({ timeout: 15 });
                    err.name.should.eql('SandboxError');
                    err.message.should.containEql('teapot');
                })
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('maps template, build, tag, and access-token APIs', function () {
        return startServer((req, res) => {
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'GET' && req.url === '/templates?teamID=team') {
                res.statusCode = 200;
                res.end(JSON.stringify([{ templateID: 'tpl_1' }]));
                return;
            }
            if (req.method === 'GET' && req.url === '/default-templates') {
                res.statusCode = 200;
                res.end(JSON.stringify([{ templateID: 'base' }]));
                return;
            }
            if (req.method === 'POST' && req.url === '/v3/templates') {
                res.statusCode = 202;
                res.end(JSON.stringify({ templateID: 'tpl_1', buildID: 'b1' }));
                return;
            }
            if (req.method === 'POST' && req.url === '/v2/templates') {
                res.statusCode = 202;
                res.end(JSON.stringify({ templateID: 'tpl_2', buildID: 'b2' }));
                return;
            }
            if (req.method === 'GET' && req.url === '/templates/tpl_1?limit=5&nextToken=n2') {
                res.statusCode = 200;
                res.end(JSON.stringify({ templateID: 'tpl_1' }));
                return;
            }
            if (req.method === 'PATCH' && req.url === '/templates/tpl_1') {
                res.statusCode = 200;
                res.end(JSON.stringify({ ok: true }));
                return;
            }
            if (req.method === 'DELETE' && req.url === '/templates/tpl_1') {
                res.statusCode = 204;
                res.end();
                return;
            }
            if (req.method === 'GET' && req.url === '/templates/tpl_1/files/hash') {
                res.statusCode = 201;
                res.end(JSON.stringify({ url: 'https://upload' }));
                return;
            }
            if (req.method === 'POST' && req.url === '/v2/templates/tpl_1/builds/b1') {
                res.statusCode = 202;
                res.end();
                return;
            }
            if (req.method === 'GET' && req.url === '/templates/tpl_1/builds/b1/status?logsOffset=1&limit=2&level=info') {
                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ready' }));
                return;
            }
            if (req.method === 'GET' && req.url === '/templates/tpl_1/builds/b1/logs?cursor=1&limit=2&direction=asc&level=info&source=builder') {
                res.statusCode = 200;
                res.end(JSON.stringify({ logs: [] }));
                return;
            }
            if (req.method === 'POST' && req.url === '/templates/tags') {
                res.statusCode = 201;
                res.end(JSON.stringify({ tags: ['v1'] }));
                return;
            }
            if (req.method === 'DELETE' && req.url === '/templates/tags') {
                res.statusCode = 204;
                res.end();
                return;
            }
            if (req.method === 'GET' && req.url === '/templates/aliases/base') {
                res.statusCode = 200;
                res.end(JSON.stringify({ exists: true }));
                return;
            }
            if (req.method === 'POST' && req.url === '/templates/tpl_1') {
                res.statusCode = 202;
                res.end(JSON.stringify({ templateID: 'tpl_1', buildID: 'b3' }));
                return;
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ message: req.method + ' ' + req.url }));
        }).then(fixture => {
            const client = new qiniu.sandbox.SandboxClient({
                apiKey: 'sandbox-key',
                accessToken: 'access-token',
                endpoint: fixture.endpoint
            });

            return client.listTemplates({ teamID: 'team' })
                .then(() => client.listDefaultTemplates())
                .then(() => client.createTemplate({ name: 'node:v1' }))
                .then(() => client.createTemplateV2({ alias: 'old' }))
                .then(() => client.getTemplate('tpl_1', { limit: 5, nextToken: 'n2' }))
                .then(() => client.updateTemplate('tpl_1', { public: true }))
                .then(() => client.deleteTemplate('tpl_1'))
                .then(() => client.getTemplateFiles('tpl_1', 'hash'))
                .then(() => client.startTemplateBuild('tpl_1', 'b1', { cpuCount: 2 }))
                .then(() => client.getTemplateBuildStatus('tpl_1', 'b1', { logsOffset: 1, limit: 2, level: 'info' }))
                .then(() => client.getTemplateBuildLogs('tpl_1', 'b1', {
                    cursor: 1,
                    limit: 2,
                    direction: 'asc',
                    level: 'info',
                    source: 'builder'
                }))
                .then(() => client.assignTemplateTags({ templateID: 'tpl_1', tags: ['v1'] }))
                .then(() => client.deleteTemplateTags({ templateID: 'tpl_1', tags: ['v1'] }))
                .then(() => client.getTemplateByAlias('base'))
                .then(() => client.rebuildTemplate('tpl_1', { name: 'again' }))
                .then(() => {
                    JSON.parse(fixture.requests[2].body).should.eql({ name: 'node:v1' });
                    JSON.parse(fixture.requests[5].body).should.eql({ public: true });
                    fixture.requests[14].headers.authorization.should.eql('Bearer access-token');
                }).then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('builds templates through an E2B style Template facade', function () {
        return startServer((req, res) => {
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                templateID: 'tpl_1',
                buildID: 'bld_1',
                status: 'building'
            }));
        }).then(fixture => {
            const template = qiniu.sandbox.Template()
                .fromImage('ubuntu:22.04')
                .aptInstall(['git'])
                .runCmd('node --version')
                .copy('/src', '/app')
                .setStartCmd('node server.js')
                .setReadyCmd('curl -f http://localhost:3000/health');

            return template.build({
                apiKey: 'sandbox-key',
                endpoint: fixture.endpoint,
                name: 'node-template:test'
            }).then(result => {
                result.templateID.should.eql('tpl_1');
                const body = JSON.parse(fixture.requests[0].body);
                body.name.should.eql('node-template:test');
                body.buildConfig.fromImage.should.eql('ubuntu:22.04');
                body.buildConfig.steps.should.eql([
                    { type: 'apt', packages: ['git'] },
                    { type: 'run', cmd: 'node --version' },
                    { type: 'copy', src: '/src', dest: '/app' }
                ]);
                body.buildConfig.startCmd.should.eql('node server.js');
                body.buildConfig.readyCmd.should.eql('curl -f http://localhost:3000/health');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('supports Template.fromTemplate in builder payloads', function () {
        return startServer((req, res) => {
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ templateID: 'tpl_child', buildID: 'bld_child' }));
        }).then(fixture => {
            return qiniu.sandbox.Template()
                .fromTemplate('base-template')
                .runCmd('echo child')
                .build({
                    apiKey: 'sandbox-key',
                    endpoint: fixture.endpoint,
                    name: 'child-template:test'
                }).then(() => {
                    const body = JSON.parse(fixture.requests[0].body);
                    body.buildConfig.fromTemplate.should.eql('base-template');
                    body.buildConfig.steps[0].cmd.should.eql('echo child');
                }).then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('supports E2B style Template filesystem, env, package, and git helpers', function () {
        return startServer((req, res) => {
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ templateID: 'tpl_helpers', buildID: 'bld_helpers' }));
        }).then(fixture => {
            return qiniu.sandbox.Template()
                .fromImage('ubuntu:22.04')
                .copyItems([
                    { src: 'app.js', dest: '/app/', user: 'root', mode: 0o755 },
                    { src: ['package.json', 'package-lock.json'], dest: '/app/' }
                ])
                .remove(['/tmp/cache dir', '/tmp/old'], { recursive: true, force: true, user: 'root' })
                .rename('/tmp/a file', '/tmp/b file', { force: true })
                .makeDir(['/app/data dir', '/app/logs'], { mode: 0o755 })
                .makeSymlink('/usr/bin/node', '/usr/local/bin/node link', { force: true, user: 'root' })
                .setWorkdir('/app')
                .setUser('node')
                .setEnvs({ NODE_ENV: 'production', PORT: '8080' })
                .pipInstall(['numpy', 'pandas'], { g: false })
                .npmInstall('typescript', { dev: true })
                .npmInstall('tsx', { g: true })
                .bunInstall(['elysia'], { dev: true })
                .aptInstall(['curl'], { noInstallRecommends: true, fixMissing: true })
                .gitClone('https://github.com/qiniu/nodejs-sdk.git', '/src/sdk dir', {
                    branch: 'sandbox',
                    depth: 1,
                    user: 'root'
                })
                .runCmd(['echo one', 'echo two'], { user: 'root' })
                .build({
                    apiKey: 'sandbox-key',
                    endpoint: fixture.endpoint,
                    name: 'helper-template:test'
                }).then(() => {
                    const body = JSON.parse(fixture.requests[0].body);
                    body.buildConfig.steps.should.eql([
                        { type: 'COPY', args: ['app.js', '/app/', 'root', '0755'] },
                        { type: 'COPY', args: ['package.json', '/app/', '', ''] },
                        { type: 'COPY', args: ['package-lock.json', '/app/', '', ''] },
                        { type: 'RUN', args: ['rm -r -f \'/tmp/cache dir\' \'/tmp/old\'', 'root'] },
                        { type: 'RUN', args: ['mv \'/tmp/a file\' \'/tmp/b file\' -f'] },
                        { type: 'RUN', args: ['mkdir -p -m 0755 \'/app/data dir\' \'/app/logs\''] },
                        { type: 'RUN', args: ['ln -s -f \'/usr/bin/node\' \'/usr/local/bin/node link\'', 'root'] },
                        { type: 'WORKDIR', args: ['/app'] },
                        { type: 'USER', args: ['node'] },
                        { type: 'ENV', args: ['NODE_ENV', 'production', 'PORT', '8080'] },
                        { type: 'RUN', args: ['pip install --user \'numpy\' \'pandas\''] },
                        { type: 'RUN', args: ['npm install --save-dev \'typescript\''] },
                        { type: 'RUN', args: ['npm install -g \'tsx\'', 'root'] },
                        { type: 'RUN', args: ['bun install --dev \'elysia\''] },
                        { type: 'RUN', args: ['apt-get update && DEBIAN_FRONTEND=noninteractive DEBCONF_NOWARNINGS=yes apt-get install -y --no-install-recommends --fix-missing \'curl\'', 'root'] },
                        { type: 'RUN', args: ['git clone \'https://github.com/qiniu/nodejs-sdk.git\' --branch \'sandbox\' --single-branch --depth \'1\' \'/src/sdk dir\'', 'root'] },
                        { type: 'RUN', args: ['echo one && echo two', 'root'] }
                    ]);
                }).then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('supports Template registry, Dockerfile, and skipCache helpers', function () {
        return startServer((req, res) => {
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ templateID: 'tpl_dockerfile', buildID: 'bld_dockerfile' }));
        }).then(fixture => {
            return qiniu.sandbox.Template()
                .skipCache()
                .fromImage('registry.example.com/private/app:latest', {
                    username: 'alice',
                    password: 'secret'
                })
                .runCmd('echo forced')
                .fromDockerfile('FROM node:22\nWORKDIR /app\nENV NODE_ENV=production PORT=3000\nRUN npm ci\nCOPY package.json /app/\nUSER node')
                .fromAWSRegistry('123456789.dkr.ecr.us-west-2.amazonaws.com/app:latest', {
                    accessKeyId: 'ak',
                    secretAccessKey: 'sk',
                    region: 'us-west-2'
                })
                .fromGCPRegistry('gcr.io/project/app:latest', {
                    serviceAccountJSON: { project_id: 'project' }
                })
                .build({
                    apiKey: 'sandbox-key',
                    endpoint: fixture.endpoint,
                    name: 'dockerfile-template:test'
                }).then(() => {
                    const body = JSON.parse(fixture.requests[0].body);
                    body.buildConfig.fromImage.should.eql('gcr.io/project/app:latest');
                    body.buildConfig.fromImageRegistry.should.eql({
                        type: 'gcp',
                        serviceAccountJson: JSON.stringify({ project_id: 'project' })
                    });
                    body.buildConfig.force.should.eql(true);
                    body.buildConfig.steps.should.eql([
                        { type: 'RUN', args: ['echo forced'], force: true },
                        { type: 'WORKDIR', args: ['/app'], force: true },
                        { type: 'ENV', args: ['NODE_ENV', 'production', 'PORT', '3000'], force: true },
                        { type: 'RUN', args: ['npm ci'], force: true },
                        { type: 'COPY', args: ['package.json', '/app/', '', ''], force: true },
                        { type: 'USER', args: ['node'], force: true }
                    ]);
                }).then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('treats long Dockerfile text as content instead of probing it as a path', function () {
        const content = 'FROM node:22\nRUN ' + new Array(1200).join('x');
        const template = qiniu.sandbox.Template().fromDockerfile(content);
        template.buildConfig.fromImage.should.eql('node:22');
        template.buildConfig.steps[0].cmd.should.match(/^x+$/);
    });

    it('parses escaped quotes in Dockerfile ENV values', function () {
        const template = qiniu.sandbox.Template()
            .fromDockerfile('FROM node:22\nENV FOO="bar\\"baz" QUOTED=\'it\\\'s ok\'');
        template.buildConfig.steps.should.eql([
            { type: 'ENV', args: ['FOO', 'bar"baz', 'QUOTED', 'it\'s ok'] }
        ]);
    });

    it('joins Dockerfile lines continued with backslash before parsing', function () {
        const template = qiniu.sandbox.Template()
            .fromDockerfile('FROM ubuntu:22.04\nRUN apt-get update && \\\n    apt-get install -y curl\nENV FOO=bar \\\n    BAZ=qux\nENV PORT 3000\nCOPY "file name.txt" "/app/data dir/"');
        template.buildConfig.steps.should.eql([
            { type: 'run', cmd: 'apt-get update &&  apt-get install -y curl' },
            { type: 'ENV', args: ['FOO', 'bar', 'BAZ', 'qux'] },
            { type: 'ENV', args: ['PORT', '3000'] },
            { type: 'COPY', args: ['file name.txt', '/app/data dir/', '', ''] }
        ]);
    });

    it('exposes network constants and maps updateNetwork to Qiniu API', function () {
        return startServer((req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                sandboxID: 'sbx_net',
                network: JSON.parse(req.body).network
            }));
        }).then(fixture => {
            const client = new qiniu.sandbox.SandboxClient({
                endpoint: fixture.endpoint,
                apiKey: 'sandbox-key'
            });
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_net',
                client,
                info: {}
            });
            qiniu.sandbox.ALL_TRAFFIC.should.eql('0.0.0.0/0');
            return sandbox.updateNetwork({ allowOut: [qiniu.sandbox.ALL_TRAFFIC] })
                .then(info => {
                    info.network.allowOut[0].should.eql('0.0.0.0/0');
                    fixture.requests[0].method.should.eql('PATCH');
                    fixture.requests[0].url.should.eql('/sandboxes/sbx_net');
                    JSON.parse(fixture.requests[0].body).should.eql({
                        network: {
                            allowOut: ['0.0.0.0/0']
                        }
                    });
                }).then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('returns typed unsupported errors for E2B volume compatibility', function () {
        const volume = new qiniu.sandbox.Volume();
        return volume.create().then(() => {
            throw new Error('expected volume.create to fail');
        }, err => {
            err.name.should.eql('NotImplementedError');
            err.message.should.containEql('Volume');
            return volume.delete();
        }).then(() => {
            throw new Error('expected volume.delete to fail');
        }, err => {
            err.name.should.eql('NotImplementedError');
            return volume.list();
        }).then(() => {
            throw new Error('expected volume.list to fail');
        }, err => {
            err.name.should.eql('NotImplementedError');
        });
    });

    it('maps injection rule CRUD APIs with Qiniu signing', function () {
        return startServer((req, res) => {
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'GET' && req.url === '/injection-rules') {
                res.statusCode = 200;
                res.end(JSON.stringify([{ id: 'rule_1' }]));
                return;
            }
            if (req.method === 'GET' && req.url === '/injection-rules/rule_1') {
                res.statusCode = 200;
                res.end(JSON.stringify({ id: 'rule_1' }));
                return;
            }
            if (req.method === 'PUT' && req.url === '/injection-rules/rule_1') {
                res.statusCode = 200;
                res.end(JSON.stringify({ id: 'rule_1', name: 'updated' }));
                return;
            }
            if (req.method === 'DELETE' && req.url === '/injection-rules/rule_1') {
                res.statusCode = 204;
                res.end();
                return;
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ message: req.method + ' ' + req.url }));
        }).then(fixture => {
            const mac = new qiniu.auth.digest.Mac('ak', 'sk', {
                disableQiniuTimestampSignature: true
            });
            const client = new qiniu.sandbox.SandboxClient({
                mac,
                endpoint: fixture.endpoint
            });

            return client.listInjectionRules()
                .then(() => client.getInjectionRule('rule_1'))
                .then(() => client.updateInjectionRule('rule_1', { name: 'updated' }))
                .then(() => client.deleteInjectionRule('rule_1'))
                .then(() => {
                    fixture.requests.length.should.eql(4);
                    fixture.requests.forEach(req => {
                        should(req.headers.authorization).startWith('Qiniu ak:');
                    });
                    JSON.parse(fixture.requests[2].body).should.eql({ name: 'updated' });
                }).then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('covers filesystem writeFiles, bytes, exists false, and envd health', function () {
        return startServer((req, res) => {
            const parsed = parseUrl(req.url);
            if (req.method === 'GET' && parsed.pathname === '/files') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/octet-stream');
                res.end(Buffer.from([1, 2, 3]));
                return;
            }
            if (req.method === 'POST' && parsed.pathname === '/files') {
                parsed.searchParams.get('path') === null ? true.should.eql(true) : false.should.eql(true);
                req.body.should.containEql('/a.txt');
                req.body.should.containEql('/b.txt');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify([
                    { name: 'a.txt', path: '/a.txt', type: 'FILE_TYPE_FILE' },
                    { name: 'b.txt', path: '/b.txt', type: 'FILE_TYPE_FILE' }
                ]));
                return;
            }
            if (req.method === 'POST' && req.url === '/filesystem.Filesystem/Stat') {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'not found' }));
                return;
            }
            if (req.method === 'GET' && req.url === '/health') {
                res.statusCode = 204;
                res.end();
                return;
            }
            res.statusCode = 500;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_7',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token'
                }
            });

            return sandbox.files.read('/bin', { format: 'bytes' })
                .then(data => {
                    Buffer.isBuffer(data).should.eql(true);
                    data.length.should.eql(3);
                    return sandbox.files.writeFiles([
                        { path: '/a.txt', data: 'a' },
                        { path: '/b.txt', data: 'b' }
                    ]);
                })
                .then(entries => {
                    entries.map(entry => entry.path).should.eql(['/a.txt', '/b.txt']);
                    return sandbox.files.exists('/missing.txt');
                })
                .then(exists => {
                    exists.should.eql(false);
                    return sandbox.isRunning();
                })
                .then(running => {
                    running.should.eql(true);
                    sandbox.getHost(1234).should.eql('');
                }).then(() => closeServer(fixture.server), err => {
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
        const pty = new qiniu.sandbox.Pty({ commands: fakeCommands });

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
                .then(() => handleGitAndPty(git, pty, commandsSeen))
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

    it('fails watchDir on Connect end-stream errors after start', function () {
        let exitError;
        return startServer((req, res) => {
            if (req.url === '/filesystem.Filesystem/WatchDir') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: {} } }),
                    encodeConnectEndEnvelope({ error: { code: 'internal', message: 'watch failed' } })
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_watch_trailer',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token',
                    envdVersion: '0.5.7'
                }
            });

            return sandbox.files.watchDir('/workspace', () => {}, {
                recursive: true,
                onExit: err => {
                    exitError = err;
                }
            }).then(handle => {
                return new Promise(resolve => setTimeout(resolve, 20)).then(() => handle);
            }).then(handle => {
                handle._stopped.should.eql(true);
                exitError.message.should.eql('watch failed');
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

    it('supports E2B git auth, branches, reset, restore, and safe remote cleanup', function () {
        const commandsSeen = [];
        const git = new qiniu.sandbox.Git({
            run: function (cmd, opts) {
                commandsSeen.push({ cmd, opts });
                if (cmd.indexOf('branch --format') >= 0) {
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
                commandText.should.containEql('branch --format');
                commandText.should.containEql('reset --hard \'HEAD~1\'');
                commandText.should.containEql('restore --staged -- \'a.txt\'');
                commandText.should.containEql('remote remove \'origin\'');
                commandText.should.containEql('remote add \'origin\'');
                commandText.should.containEql('fetch \'origin\'');
                commandText.should.containEql('commit -m \'msg\' --author \'Alice <alice@example.com>\' --allow-empty');
                commandText.should.containEql('config --global \'user.name\' \'Alice\'');
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
                return client.createAndWait({ template: 'base' }, { interval: 1, timeout: 100 });
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
                interval: 1,
                timeout: 50
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

            return sandbox.waitForReady({ interval: 1, timeout: 100 }).then(() => {
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

    it('rethrows non-502 envd health errors', function () {
        return startServer((req, res) => {
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

            return sandbox.isRunning().then(() => {
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

    it('supports JSON fallback for process stream responses and poll timeout errors', function () {
        return startServer((req, res) => {
            if (req.url === '/process.Process/Start') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    events: [
                        { event: { start: { pid: 22 } } },
                        { event: { data: { stdout: Buffer.from('ok').toString('base64') } } },
                        { event: { end: { exitCode: 0 } } }
                    ]
                }));
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

            return sandbox.commands.run('echo ok')
                .then(result => {
                    result.stdout.should.eql('ok');
                    return sandbox.waitForReady({ interval: 1, timeout: 5 });
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

    it('throws TemplateBuildError when a template build finishes with error status', function () {
        return startServer((req, res) => {
            if (req.url === '/templates/tpl_1/builds/bld_1/status') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ status: 'error', error: 'compile failed' }));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const client = new qiniu.sandbox.SandboxClient({
                endpoint: fixture.endpoint,
                apiKey: 'sandbox-key'
            });

            return client.waitForBuild('tpl_1', 'bld_1', { interval: 1, timeout: 20 }).then(() => {
                throw new Error('expected template build error');
            }, err => {
                err.name.should.eql('TemplateBuildError');
                err.message.should.eql('compile failed');
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

    it('normalizes snake_case sandbox info and camelCase injection inputs', function () {
        return startServer((req, res) => {
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'POST' && req.url === '/sandboxes') {
                res.statusCode = 201;
                res.end(JSON.stringify({
                    sandbox_id: 'sbx_snake',
                    sandbox_domain: 'snake.example.com'
                }));
                return;
            }
            if (req.method === 'GET' && req.url === '/sandboxes/sbx_snake') {
                res.statusCode = 200;
                res.end(JSON.stringify({
                    sandbox_id: 'sbx_snake',
                    domain: 'snake.example.com',
                    envd_access_token: 'snake-token',
                    envd_version: '1.2.3'
                }));
                return;
            }
            if (req.method === 'POST' && req.url === '/injection-rules') {
                res.statusCode = 201;
                res.end(JSON.stringify({ ruleID: 'rule_1' }));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const mac = new qiniu.auth.digest.Mac('ak', 'sk', {
                disableQiniuTimestampSignature: true
            });
            const client = new qiniu.sandbox.SandboxClient({
                endpoint: fixture.endpoint,
                apiKey: 'sandbox-key',
                mac
            });

            return qiniu.sandbox.Sandbox.create({ client, template: 'base' })
                .then(sandbox => {
                    sandbox.sandboxId.should.eql('sbx_snake');
                    sandbox.envdAccessToken.should.eql('snake-token');
                    sandbox.envdVersion.should.eql('1.2.3');
                    return client.createInjectionRule({
                        name: 'qiniu',
                        injection: {
                            type: 'qiniu',
                            baseUrl: 'https://api.qnaigc.com',
                            apiKey: 'secret'
                        }
                    });
                })
                .then(() => {
                    JSON.parse(fixture.requests[2].body).should.eql({
                        name: 'qiniu',
                        injection: {
                            type: 'qiniu',
                            base_url: 'https://api.qnaigc.com',
                            api_key: 'secret'
                        }
                    });
                })
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('supports E2B style sandbox paginator, snapshots, and MCP helpers', function () {
        let tokenReads = 0;
        return startServer((req, res) => {
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'GET' && req.url === '/v2/sandboxes?limit=2&nextToken=n1&metadata%5Buser%5D=alice&state=running') {
                res.statusCode = 200;
                res.end(JSON.stringify({
                    items: [{ sandboxID: 'sbx_page', domain: 'page.example.com' }],
                    nextToken: 'n2'
                }));
                return;
            }
            if (req.method === 'POST' && req.url === '/sandboxes/sbx_page/snapshots') {
                res.statusCode = 201;
                res.end(JSON.stringify({ snapshotID: 'snap_1', snapshotId: 'snap_1' }));
                return;
            }
            if (req.method === 'GET' && req.url === '/snapshots?limit=1&sandboxId=sbx_page') {
                res.statusCode = 200;
                res.end(JSON.stringify({
                    items: [{ snapshotID: 'snap_1', snapshotId: 'snap_1' }],
                    nextToken: 'snap_next'
                }));
                return;
            }
            const parsed = parseUrl(req.url);
            if (req.method === 'GET' && parsed.pathname === '/files' && parsed.searchParams.get('path') === '/etc/mcp-gateway/.token') {
                tokenReads += 1;
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/plain');
                res.end('mcp-token\n');
                return;
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ message: req.method + ' ' + req.url }));
        }).then(fixture => {
            const client = new qiniu.sandbox.SandboxClient({
                endpoint: fixture.endpoint,
                apiKey: 'sandbox-key'
            });
            const paginator = qiniu.sandbox.Sandbox.list({
                client,
                limit: 2,
                nextToken: 'n1',
                query: {
                    metadata: { user: 'alice' },
                    state: ['running']
                }
            });

            return paginator.nextItems().then(items => {
                items[0].sandboxId.should.eql('sbx_page');
                paginator.hasNext.should.eql(true);
                paginator.nextToken.should.eql('n2');
                const sandbox = new qiniu.sandbox.Sandbox({
                    sandboxId: 'sbx_page',
                    envdUrl: fixture.endpoint,
                    info: {
                        domain: 'page.example.com',
                        envdAccessToken: 'token'
                    },
                    client
                });
                sandbox.getMcpUrl().should.eql('https://50005-sbx_page.page.example.com/mcp');
                return Promise.all([
                    sandbox.getMcpToken(),
                    sandbox.getMcpToken()
                ]).then(tokens => {
                    tokens.should.eql(['mcp-token', 'mcp-token']);
                    tokenReads.should.eql(1);
                    return sandbox.getMcpToken();
                }).then(token => {
                    token.should.eql('mcp-token');
                    tokenReads.should.eql(1);
                    return sandbox.createSnapshot({ name: 'snap' });
                }).then(snapshot => {
                    snapshot.snapshotId.should.eql('snap_1');
                    return sandbox.listSnapshots({ limit: 1 }).nextItems();
                });
            }).then(snapshots => {
                snapshots[0].snapshotId.should.eql('snap_1');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

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
                    encodeConnectEnvelope({ event: { data: { pty: [111, 107] } } }),
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
                .then(() => sandbox.pty.sendInput(44, Buffer.from('ls\n')))
                .then(() => sandbox.pty.resize(44, { cols: 100, rows: 30 }))
                .then(() => sandbox.pty.kill(44))
                .then(killed => {
                    killed.should.eql(true);
                    data.should.eql(['ok', 'ok']);
                    const sendBody = JSON.parse(fixture.requests[3].body);
                    sendBody.input.pty.should.eql(Buffer.from('ls\n').toString('base64'));
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

    it('supports filesystem gzip and octet-stream write compatibility options', function () {
        return startServer((req, res) => {
            const parsed = parseUrl(req.url);
            if (req.method === 'GET' && parsed.pathname === '/files') {
                req.headers['accept-encoding'].should.eql('gzip');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/plain');
                res.end('zip');
                return;
            }
            if (req.method === 'POST' && parsed.pathname === '/files') {
                req.headers['content-type'].should.eql('application/octet-stream');
                req.headers['content-encoding'].should.eql('gzip');
                parsed.searchParams.get('path').should.eql('/zip.txt');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify([{ name: 'zip.txt', path: '/zip.txt', type: 'file' }]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_zip',
                envdUrl: fixture.endpoint,
                info: {
                    envdVersion: '0.5.7',
                    envdAccessToken: 'token'
                }
            });

            return sandbox.files.read('/zip.txt', { gzip: true })
                .then(text => {
                    text.should.eql('zip');
                    return sandbox.files.write('/zip.txt', 'zip', {
                        gzip: true,
                        useOctetStream: true
                    });
                })
                .then(info => {
                    info.path.should.eql('/zip.txt');
                })
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('falls back to multipart uploads when envd does not support octet-stream', function () {
        return startServer((req, res) => {
            const parsed = parseUrl(req.url);
            if (req.method === 'POST' && parsed.pathname === '/files') {
                should(req.headers['content-type']).startWith('multipart/form-data; boundary=');
                should.not.exist(req.headers['content-encoding']);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify([{ name: 'zip.txt', path: '/zip.txt', type: 'file' }]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_zip_old',
                envdUrl: fixture.endpoint,
                info: {
                    envdVersion: '0.5.5',
                    envdAccessToken: 'token'
                }
            });

            return sandbox.files.write('/zip.txt', 'zip', {
                gzip: true,
                useOctetStream: true
            }).then(info => {
                info.path.should.eql('/zip.txt');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('exports sandbox constants and typed helpers aligned with common runtime names', function () {
        qiniu.sandbox.DEFAULT_SANDBOX_TIMEOUT_MS.should.eql(300000);
        qiniu.sandbox.FileType.FILE.should.eql('file');
        qiniu.sandbox.FileType.DIR.should.eql('dir');
        qiniu.DEFAULT_SANDBOX_TIMEOUT_MS.should.eql(qiniu.sandbox.DEFAULT_SANDBOX_TIMEOUT_MS);
        qiniu.FileType.should.equal(qiniu.sandbox.FileType);
        new qiniu.sandbox.InvalidArgumentError('bad arg').name.should.eql('InvalidArgumentError');
        new qiniu.sandbox.FileNotFoundError('missing').name.should.eql('FileNotFoundError');
    });

    it('supports instance connect and betaPause aliases', function () {
        return startServer((req, res) => {
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'POST' && req.url === '/sandboxes/sbx_alias/connect') {
                res.statusCode = 200;
                res.end(JSON.stringify({
                    sandboxID: 'sbx_alias',
                    domain: 'alias.example.com',
                    envdAccessToken: 'token2',
                    envdVersion: '0.5.7'
                }));
                return;
            }
            if (req.method === 'POST' && req.url === '/sandboxes/sbx_alias/pause') {
                res.statusCode = 204;
                res.end();
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_alias',
                client: new qiniu.sandbox.SandboxClient({
                    endpoint: fixture.endpoint,
                    apiKey: 'sandbox-key'
                }),
                info: {}
            });

            return sandbox.connect({ timeoutMs: 30000 })
                .then(connected => {
                    connected.should.equal(sandbox);
                    sandbox.envdAccessToken.should.eql('token2');
                    sandbox.envdVersion.should.eql('0.5.7');
                    sandbox.domain.should.eql('alias.example.com');
                    return sandbox.betaPause();
                })
                .then(paused => {
                    should(paused).equal(null);
                })
                .then(() => closeServer(fixture.server), err => {
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
            target: 'HEAD~1',
            paths: ['a.txt']
        })).then(() => git.restore('/repo', {
            paths: ['a.txt']
        })).then(() => {
            commandsSeen.map(item => item.cmd).should.eql([
                'git config --local \'user.name\' \'Alice\'',
                'git config --local --get \'user.name\'',
                'git config --local \'user.name\' \'Alice\'',
                'git config --local \'user.email\' \'alice@example.com\'',
                'git reset --hard \'HEAD~1\' -- \'a.txt\'',
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

function handleGitAndPty (git, pty, commandsSeen) {
    return git.clone('https://example.com/repo.git', { path: '/repo' })
        .then(() => git.init('/repo'))
        .then(() => git.add('/repo', { all: true }))
        .then(() => git.commit('/repo', 'msg', { allowEmpty: true }))
        .then(() => git.pull('/repo', { remote: 'origin', branch: 'main' }))
        .then(() => git.push('/repo', { remote: 'origin', branch: 'main' }))
        .then(() => git.createBranch('/repo', 'feature'))
        .then(() => git.checkoutBranch('/repo', 'main'))
        .then(() => git.deleteBranch('/repo', 'feature', { force: true }))
        .then(() => git.remoteAdd('/repo', 'origin', 'https://example.com/repo.git'))
        .then(() => git.remoteGet('/repo', 'origin'))
        .then(value => {
            value.should.eql('value');
            return git.setConfig('/repo', 'user.name', 'Alice');
        })
        .then(() => git.getConfig('/repo', 'user.name'))
        .then(value => {
            value.should.eql('value');
            return git.configureUser('/repo', 'Alice', 'alice@example.com');
        })
        .then(() => pty.create({ cmd: 'bash', cwd: '/repo' }))
        .then(handle => {
            handle.pid.should.eql(9);
            commandsSeen[0].cmd.should.eql('git clone \'https://example.com/repo.git\' \'/repo\'');
            commandsSeen[1].cmd.should.eql('git init');
            commandsSeen[1].opts.cwd.should.eql('/repo');
            commandsSeen.some(item => item.cmd.indexOf('git commit -m') === 0).should.eql(true);
            commandsSeen[commandsSeen.length - 1].cmd.should.eql('bash');
            commandsSeen[commandsSeen.length - 1].opts.stdin.should.eql(true);
        });
}
