const {
    should,
    stream,
    zlib,
    qiniu,
    startServer,
    closeServer,
    parseUrl,
    decodeConnectEnvelope,
    encodeConnectEnvelope,
    encodeRawConnectEnvelope,
    encodeConnectEndEnvelope,
    encodeOversizedConnectHeader,
    encodeTruncatedConnectHeader
} = require('./sandbox_helpers');

describe('test sandbox filesystem module', function () {
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
        const expiration = Number(parsed.searchParams.get('signature_expiration'));
        expiration.should.be.above(Math.floor(Date.now() / 1000));
        expiration.should.be.below(Math.floor(Date.now() / 1000) + 120);
        should(parsed.searchParams.get('signature')).startWith('v1_');

        const absolute = parseUrl(sandbox.uploadUrl('/home/user/a.txt', {
            signatureExpiration: 2000000000
        }));
        absolute.searchParams.get('signature_expiration').should.eql('2000000000');
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
                req.body.should.containEql('filename="/hello.txt"');
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

    it('escapes file paths in multipart filenames', function () {
        const unsafePath = '/tmp/a"\r\nX-Injected: y.txt';
        return startServer((req, res) => {
            const parsed = parseUrl(req.url);
            if (req.method === 'POST' && parsed.pathname === '/files') {
                parsed.searchParams.get('path').should.eql(unsafePath);
                req.body.should.containEql('filename="/tmp/a\\"%0D%0AX-Injected: y.txt"');
                req.body.should.not.containEql('\r\nX-Injected');
                req.body.should.not.containEql('a"\r\n');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify([{ name: 'a.txt', path: unsafePath, type: 'file' }]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_multipart_safe',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token',
                    envdVersion: '0.5.5'
                }
            });

            return sandbox.files.write(unsafePath, 'hello')
                .then(info => {
                    info.path.should.eql(unsafePath);
                })
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('rejects Readable streams passed directly to filesystem write', function () {
        const sandbox = new qiniu.sandbox.Sandbox({
            sandboxId: 'sbx_stream_write',
            envdUrl: 'http://127.0.0.1:9',
            info: {
                envdAccessToken: 'token'
            }
        });

        return sandbox.files.write('/stream.txt', new stream.Readable({
            read: function () {}
        })).then(() => {
            throw new Error('expected stream write to reject');
        }, err => {
            err.message.should.eql('Streams are not supported as data in filesystem.write');
        });
    });

    it('preserves falsy multipart payload values', function () {
        return startServer((req, res) => {
            const parsed = parseUrl(req.url);
            if (req.method === 'POST' && parsed.pathname === '/files') {
                parsed.searchParams.get('path').should.eql('/zero.txt');
                req.body.should.containEql('\r\n0\r\n');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify([{ name: 'zero.txt', path: '/zero.txt', type: 'file' }]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_multipart_falsy',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token',
                    envdVersion: '0.5.5'
                }
            });

            return sandbox.files.write('/zero.txt', 0)
                .then(info => {
                    info.path.should.eql('/zero.txt');
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

    it('rejects recursive directory watching when envd version is unknown', function () {
        const sandbox = new qiniu.sandbox.Sandbox({
            sandboxId: 'sbx_unknown_watch',
            envdUrl: 'http://127.0.0.1:9',
            info: {
                envdAccessToken: 'token'
            }
        });

        return sandbox.files.watchDir('/workspace', () => {}, {
            recursive: true
        }).then(() => {
            throw new Error('expected watchDir to reject without envd version');
        }, err => {
            err.name.should.eql('SandboxError');
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
                parsed.searchParams.get('username').should.eql('user');
                should(parsed.searchParams.get('signature')).startWith('v1_');
                Number(parsed.searchParams.get('signature_expiration')).should.be.above(Math.floor(Date.now() / 1000));
                req.body.should.containEql('/a.txt');
                req.body.should.containEql('/b.txt');
                req.rawBody.includes(Buffer.from([1, 2, 3])).should.eql(true);
                req.rawBody.includes(Buffer.from([4, 5, 6])).should.eql(true);
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
                        { path: '/a.txt', data: new Uint8Array([1, 2, 3]) },
                        { path: '/b.txt', data: new Uint8Array([4, 5, 6]).buffer }
                    ], { user: 'user' });
                })
                .then(entries => {
                    entries.map(entry => entry.path).should.eql(['/a.txt', '/b.txt']);
                    return sandbox.files.writeFiles(null).then(() => {
                        throw new Error('expected writeFiles invalid files to fail');
                    }, err => {
                        err.name.should.eql('TypeError');
                        err.message.should.eql('files must be an array');
                    });
                })
                .then(() => {
                    return sandbox.files.writeFiles([null]).then(() => {
                        throw new Error('expected writeFiles invalid file item to fail');
                    }, err => {
                        err.name.should.eql('TypeError');
                        err.message.should.eql('Each file must be an object');
                    });
                })
                .then(() => {
                    return sandbox.files.writeFiles([
                        { path: '/stream.txt', data: new stream.Readable() }
                    ]).then(() => {
                        throw new Error('expected writeFiles stream data to fail');
                    }, err => {
                        err.name.should.eql('TypeError');
                        err.message.should.match(/Streams are not supported/);
                    });
                })
                .then(() => {
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

    it('fails watchDir when the event callback throws', function () {
        let exitError;
        return startServer((req, res) => {
            if (req.url === '/filesystem.Filesystem/WatchDir') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.write(encodeConnectEnvelope({ event: { start: {} } }));
                res.write(encodeConnectEnvelope({
                    event: {
                        filesystem: {
                            name: 'created.txt',
                            type: 'EVENT_TYPE_CREATE'
                        }
                    }
                }));
                setTimeout(() => res.end(), 50);
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_watch_callback',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token',
                    envdVersion: '0.5.7'
                }
            });

            return sandbox.files.watchDir('/workspace', () => {
                throw new Error('callback failed');
            }, {
                recursive: true,
                onExit: err => {
                    exitError = err;
                }
            }).then(handle => {
                return new Promise(resolve => setTimeout(resolve, 20)).then(() => handle);
            }).then(handle => {
                handle._stopped.should.eql(true);
                exitError.message.should.eql('callback failed');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('fails watchDir when the event callback rejects asynchronously', function () {
        let exitError;
        return startServer((req, res) => {
            if (req.url === '/filesystem.Filesystem/WatchDir') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: {} } }),
                    encodeConnectEnvelope({
                        event: {
                            filesystem: {
                                name: 'created.txt',
                                type: 'EVENT_TYPE_CREATE'
                            }
                        }
                    })
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_watch_async_callback',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token',
                    envdVersion: '0.5.7'
                }
            });

            return sandbox.files.watchDir('/workspace', () => Promise.reject(new Error('async callback failed')), {
                recursive: true,
                onExit: err => {
                    exitError = err;
                }
            }).then(handle => {
                return new Promise(resolve => setTimeout(resolve, 20)).then(() => handle);
            }).then(handle => {
                handle._stopped.should.eql(true);
                exitError.message.should.eql('async callback failed');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('handles rejected async watchDir onExit callbacks', function () {
        let exitCalled = false;
        return startServer((req, res) => {
            if (req.url === '/filesystem.Filesystem/WatchDir') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(encodeConnectEnvelope({ event: { start: {} } }));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_watch_async_exit',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token',
                    envdVersion: '0.5.7'
                }
            });

            return sandbox.files.watchDir('/workspace', () => {}, {
                recursive: true,
                onExit: () => {
                    exitCalled = true;
                    return Promise.reject(new Error('async exit failed'));
                }
            }).then(handle => {
                return new Promise(resolve => setTimeout(resolve, 20)).then(() => handle);
            }).then(handle => {
                handle._stopped.should.eql(true);
                exitCalled.should.eql(true);
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('fails watchDir when the live Connect stream ends with a partial frame after start', function () {
        let exitError;
        return startServer((req, res) => {
            if (req.url === '/filesystem.Filesystem/WatchDir') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                res.end(Buffer.concat([
                    encodeConnectEnvelope({ event: { start: {} } }),
                    encodeTruncatedConnectHeader()
                ]));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_watch_truncated_tail',
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
                exitError.message.should.eql('Sandbox envd stream truncated unexpectedly');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('treats watchDir timeout alias as seconds while waiting for stream start', function () {
        return startServer((req, res) => {
            if (req.url === '/filesystem.Filesystem/WatchDir') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/connect+json');
                setTimeout(() => {
                    res.end(encodeConnectEnvelope({ event: { start: {} } }));
                }, 20);
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_watch_timeout_seconds',
                envdUrl: fixture.endpoint,
                info: {
                    envdAccessToken: 'token',
                    envdVersion: '0.5.7'
                }
            });

            return sandbox.files.watchDir('/workspace', () => {}, {
                recursive: true,
                timeout: 1
            }).then(handle => {
                handle._stopped.should.eql(true);
            }).then(() => closeServer(fixture.server), err => {
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
                Array.from(zlib.gunzipSync(req.rawBody)).should.eql([1, 2, 3]);
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
                    return sandbox.files.write('/zip.txt', new Uint8Array([1, 2, 3]), {
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
});
