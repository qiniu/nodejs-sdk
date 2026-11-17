const {
    should,
    http,
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
const { execFile } = require('child_process');
const fs = require('fs');

describe('test sandbox filesystem module', function () {
    describe('stream transfer lifecycle', function () {
        let fixture;
        let sandbox;

        afterEach(function () {
            if (fixture) return closeServer(fixture.server).then(() => { fixture = null; });
        });

        function serve (handler) {
            return startServer(handler).then(value => {
                fixture = value;
                sandbox = new qiniu.sandbox.Sandbox({
                    sandboxId: 'transfer',
                    envdUrl: fixture.endpoint,
                    info: { envdAccessToken: 'token', envdVersion: '0.5.7' }
                });
            });
        }

        function readable (text) {
            const source = new stream.Readable({ read: function () {} });
            source.push(text);
            source.push(null);
            return source;
        }

        function consume (source) {
            return new Promise((resolve, reject) => {
                const chunks = [];
                source.on('data', chunk => chunks.push(chunk));
                source.on('error', reject);
                source.on('end', () => resolve(Buffer.concat(chunks).toString()));
            });
        }

        ['multipart', 'octet', 'gzip', 'batch', 'queued'].forEach(mode => {
            it(`rejects prematurely closed ${mode} upload sources with the deadline disabled`, function () {
                const sockets = [];
                const source = new stream.Readable({ read: function () {} });
                source.push('partial');
                const server = http.createServer((req, res) => {
                    req.resume();
                    req.on('end', () => res.end('[]'));
                });
                server.on('connection', socket => sockets.push(socket));
                return new Promise(resolve => server.listen(0, '127.0.0.1', resolve)).then(() => {
                    fixture = { server };
                    sandbox = new qiniu.sandbox.Sandbox({
                        sandboxId: 'premature-source',
                        envdUrl: `http://127.0.0.1:${server.address().port}`,
                        info: { envdAccessToken: 'token', envdVersion: '0.5.7' }
                    });
                    const opts = { requestTimeoutMs: 0, useOctetStream: mode === 'octet' || mode === 'gzip', gzip: mode === 'gzip' };
                    const files = mode === 'queued'
                        ? [{ path: '/blocked', data: new stream.Readable({ read: function () {} }) }, { path: '/partial', data: source }]
                        : [{ path: '/partial', data: source }];
                    const transfer = mode === 'batch' || mode === 'queued'
                        ? sandbox.files.writeFiles(files, opts)
                        : sandbox.files.write('/partial', source, opts);
                    setTimeout(() => source.emit('close'), 10);
                    return new Promise((resolve, reject) => {
                        const timer = setTimeout(() => reject(new Error('upload did not settle after source close')), 200);
                        transfer.then(() => {
                            clearTimeout(timer);
                            reject(new Error('expected prematurely closed upload to fail'));
                        }, err => {
                            clearTimeout(timer);
                            resolve(err);
                        });
                    });
                }).then(err => {
                    err.message.should.match(/upload.*closed/i);
                    source.destroyed.should.eql(true);
                }).then(() => sockets.forEach(socket => socket.destroy()), err => {
                    sockets.forEach(socket => socket.destroy());
                    throw err;
                });
            });
        });

        ['multipart', 'octet', 'gzip', 'batch'].forEach(mode => {
            it(`accepts ${mode} sources that close during their normal end event`, function () {
                return serve((req, res) => {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify([{ path: '/complete', type: 'file' }]));
                }).then(() => {
                    const source = readable('complete');
                    source.once('end', () => source.emit('close'));
                    const opts = { requestTimeoutMs: 0, useOctetStream: mode === 'octet' || mode === 'gzip', gzip: mode === 'gzip' };
                    return mode === 'batch'
                        ? sandbox.files.writeFiles([{ path: '/complete', data: source }], opts)
                        : sandbox.files.write('/complete', source, opts);
                }).then(result => {
                    const entry = Array.isArray(result) ? result[0] : result;
                    entry.path.should.eql('/complete');
                });
            });
        });

        it('rejects overflowing file deadlines before opening read or upload requests', function () {
            return serve((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('[]'); })
                .then(() => {
                    const calls = [];
                    [{ requestTimeoutMs: 2147483648 }, { timeoutMs: 2147483648 }, { timeout: 2147483.648 }].forEach(opts => {
                        calls.push(sandbox.files.read('/x', opts));
                        calls.push(sandbox.files.write('/x', 'data', opts));
                        calls.push(sandbox.files.writeFiles([{ path: '/x', data: 'data' }], opts));
                    });
                    return Promise.all(calls.map(call => call.then(() => {
                        throw new Error('expected out-of-range file deadline');
                    }, err => {
                        err.name.should.eql('RangeError');
                        err.message.should.match(/2147483647/);
                    })));
                }).then(() => fixture.requests.length.should.eql(0));
        });

        it('accepts the maximum file deadline before overflowing lower-priority aliases', function () {
            return serve((req, res) => res.end('maximum deadline'))
                .then(() => sandbox.files.read('/x', {
                    requestTimeoutMs: 2147483647, timeoutMs: 2147483648, timeout: 2147483.648
                })).then(text => text.should.eql('maximum deadline'));
        });

        it('owns early and cancellation errors from every upload source', function () {
            return Promise.all(['multipart', 'octet', 'batch', 'queued', 'cleanup'].map(mode => {
                const script = [
                    'const http = require(\'http\'); const Readable = require(\'stream\').Readable; const qiniu = require(\'./index\');',
                    `const mode = ${JSON.stringify(mode)}; const uncaught = [];`,
                    'process.on(\'uncaughtException\', err => uncaught.push(err.message));',
                    'const server = http.createServer((req, res) => {});',
                    'server.listen(0, \'127.0.0.1\', () => {',
                    'const sandbox = new qiniu.sandbox.Sandbox({ sandboxId:\'early\', envdUrl:\'http://127.0.0.1:\'+server.address().port, info:{envdAccessToken:\'token\',envdVersion:\'0.5.7\'} });',
                    'const source = new Readable({ read:function(){}, destroy:function(err,done){done(mode===\'cleanup\'?new Error(\'cleanup failed\'):err);} });',
                    'if(mode!==\'cleanup\') process.nextTick(()=>{const err=new Error(\'early failure\');if(source.destroy)source.destroy(err);else source.emit(\'error\',err);});',
                    'const opts={requestTimeoutMs:30,useOctetStream:mode===\'octet\'};',
                    'const files=mode===\'queued\'?[{path:\'/blocked\',data:new Readable({read:function(){}})},{path:\'/x\',data:source}]:[{path:\'/x\',data:source}];',
                    'const call=mode===\'batch\'||mode===\'queued\'?sandbox.files.writeFiles(files,opts):sandbox.files.write(\'/x\',source,opts);',
                    'call.then(()=>{console.log(JSON.stringify({error:\'unexpected success\',uncaught}));server.close();},err=>{setTimeout(()=>{console.log(JSON.stringify({error:err.message,name:err.name,uncaught}));server.close();},10);});',
                    '});'
                ].join('\n');
                return new Promise((resolve, reject) => {
                    execFile(process.execPath, ['-e', script], { timeout: 2000 }, (err, stdout) => {
                        if (err) return reject(err);
                        try {
                            const result = JSON.parse(stdout.trim());
                            result.uncaught.should.eql([]);
                            if (mode === 'cleanup') result.name.should.eql('TimeoutError');
                            else result.error.should.eql('early failure');
                            resolve();
                        } catch (failure) { reject(failure); }
                    });
                });
            }));
        });

        it('keeps the default connection timeout while custom DNS lookup is pending', function () {
            const script = [
                'const http=require(\'http\'); const qiniu=require(\'./index\'); let error;',
                'process.on(\'exit\',()=>console.log(JSON.stringify({error})));',
                'const client=new qiniu.sandbox.SandboxClient({httpAgent:new http.Agent({lookup:function(){}})});',
                'const sandbox=new qiniu.sandbox.Sandbox({client,sandboxId:\'dns\',envdUrl:\'http://lookup.invalid\',info:{envdAccessToken:\'token\'}});',
                'sandbox.files.read(\'/x\').catch(err=>{error=err.name;});'
            ].join('\n');
            return new Promise((resolve, reject) => {
                execFile(process.execPath, ['-e', script], { timeout: 7000 }, (err, stdout) => {
                    if (err) return reject(err);
                    try {
                        should(JSON.parse(stdout.trim()).error).eql('TimeoutError');
                        resolve();
                    } catch (failure) { reject(failure); }
                });
            });
        });

        it('keeps the upload deadline until an early successful response and input both complete', function () {
            let timer;
            let socket;
            const source = new stream.Readable({ read: function () {} });
            const server = http.createServer((req, res) => { socket = req.socket; res.end('{}'); });
            return new Promise(resolve => server.listen(0, '127.0.0.1', resolve)).then(() => {
                fixture = { server };
                sandbox = new qiniu.sandbox.Sandbox({
                    sandboxId: 'early-response',
                    envdUrl: `http://127.0.0.1:${server.address().port}`,
                    info: { envdAccessToken: 'token', envdVersion: '0.5.7' }
                });
                timer = setInterval(() => source.push(Buffer.alloc(1024)), 5);
                source.on('close', () => clearInterval(timer));
                return sandbox.files.write('/unfinished', source, { useOctetStream: true, requestTimeoutMs: 30 });
            }).then(() => { throw new Error('expected incomplete upload to fail'); }, err => {
                err.message.should.match(/upload|timed out/);
                source.destroyed.should.eql(true);
            }).then(() => { clearInterval(timer); }, err => {
                clearInterval(timer);
                source.destroy();
                if (socket) socket.destroy();
                throw err;
            });
        });

        it('decodes compressed downloads without buffering the response', function () {
            return serve((req, res) => {
                res.setHeader('Content-Encoding', 'gzip');
                res.end(zlib.gzipSync(Buffer.from('compressed download')));
            }).then(() => sandbox.files.read('/gzip', { format: 'stream' }))
                .then(consume).then(text => text.should.eql('compressed download'));
        });

        it('reports HTTP errors before returning a download stream', function () {
            return serve((req, res) => { res.statusCode = 404; res.end('missing'); })
                .then(() => sandbox.files.read('/missing', { format: 'stream' }))
                .then(() => { throw new Error('expected HTTP error'); }, err => {
                    err.name.should.eql('SandboxError');
                    err.response.statusCode.should.eql(404);
                    err.data.toString().should.eql('missing');
                });
        });

        it('preserves parsed JSON error bodies for single and batch uploads', function () {
            const body = { code: 'permission_denied', message: 'forbidden' };
            return serve((req, res) => {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(body));
            }).then(() => Promise.all([
                sandbox.files.write('/denied', 'data'),
                sandbox.files.writeFiles([{ path: '/denied', data: 'data' }])
            ].map(call => call.then(() => {
                throw new Error('expected HTTP failure');
            }, err => {
                err.name.should.eql('SandboxError');
                err.response.statusCode.should.eql(403);
                err.data.should.eql(body);
            }))));
        });

        ['upstream unavailable', '{"message":'].forEach(body => {
            it(`preserves the HTTP failure and raw body when upload error JSON is invalid: ${body}`, function () {
                return serve((req, res) => {
                    res.statusCode = 502;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(body);
                }).then(() => Promise.all([
                    sandbox.files.write('/failed', 'data', { useOctetStream: true }),
                    sandbox.files.writeFiles([{ path: '/failed', data: 'data' }])
                ].map(call => call.then(() => {
                    throw new Error('expected HTTP failure');
                }, err => {
                    err.name.should.eql('SandboxError');
                    err.response.statusCode.should.eql(502);
                    err.data.toString().should.eql(body);
                    Buffer.isBuffer(err.data).should.eql(true);
                }))));
            });
        });

        it('keeps empty JSON upload responses compatible with buffered transfers', function () {
            return serve((req, res) => { res.statusCode = 204; res.end(); })
                .then(() => sandbox.files.writeFiles([{ path: '/empty', data: '' }]))
                .then(items => items.should.eql([]));
        });

        it('reports interrupted download bodies through the returned stream', function () {
            return serve((req, res) => {
                res.write('partial');
                setTimeout(() => res.destroy(), 10);
            }).then(() => sandbox.files.read('/truncated', { format: 'stream' }))
                .then(source => {
                    let ended = false;
                    const closed = new Promise(resolve => source.once('close', resolve));
                    source.once('end', () => { ended = true; });
                    return consume(source).then(() => { throw new Error('expected interrupted stream'); }, err => {
                        err.message.should.match(/aborted|closed/);
                        return closed;
                    }).then(() => {
                        ended.should.eql(false);
                        if (typeof source.closed === 'boolean') source.closed.should.eql(true);
                    });
                });
        });

        it('closes the connection when a download consumer destroys its stream', function () {
            let closed;
            const connectionClosed = new Promise(resolve => { closed = resolve; });
            return serve((req, res) => {
                res.write('first');
                res.on('close', closed);
            }).then(() => sandbox.files.read('/cancel', { format: 'stream' }))
                .then(source => { source.destroy(); return connectionClosed; });
        });

        it('stops buffered download data immediately when the consumer destroys the stream', function () {
            return serve((req, res) => {
                res.write('first');
                const timer = setTimeout(() => res.write('second'), 10);
                res.on('close', () => clearTimeout(timer));
            }).then(() => sandbox.files.read('/cancel-buffered', { format: 'stream' }))
                .then(source => {
                    const events = [];
                    source.on('error', err => events.push(`error:${err.message}`));
                    source.on('end', () => events.push('end'));
                    const closed = new Promise(resolve => source.once('close', () => {
                        events.push('close');
                        resolve();
                    }));
                    return new Promise(resolve => setTimeout(resolve, 40)).then(() => {
                        source.on('data', () => {
                            events.push('data');
                            source.destroy(new Error('consumer stop'));
                        });
                        return closed;
                    }).then(() => events.should.eql(['data', 'error:consumer stop', 'close']));
                });
        });

        it('applies a file deadline after download headers and gives requestTimeoutMs precedence', function () {
            return serve((req, res) => { res.write('first'); })
                .then(() => sandbox.files.read('/slow', {
                    format: 'stream', requestTimeoutMs: 20, timeoutMs: 200, timeout: 1
                })).then(consume).then(() => { throw new Error('expected timeout'); }, err => {
                    err.name.should.eql('TimeoutError');
                });
        });

        it('accepts zero to disable the file deadline and supports buffered timeout aliases', function () {
            return serve((req, res) => {
                res.write('first');
                const timer = setTimeout(() => res.end('second'), 50);
                res.on('close', () => clearTimeout(timer));
            }).then(() => sandbox.files.read('/slow', { requestTimeoutMs: 0, timeoutMs: 2147483648 }))
                .then(text => {
                    text.should.eql('firstsecond');
                    return sandbox.files.read('/slow', { timeout: 0.01 });
                }).then(() => { throw new Error('expected buffered timeout'); }, err => {
                    err.name.should.eql('TimeoutError');
                });
        });

        it('uploads mixed batch data in order and compresses readable octet-stream bodies', function () {
            return serve((req, res) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify([{ path: '/uploaded', type: 'file' }]));
            }).then(() => sandbox.files.writeFiles([
                { path: '/one', data: 'one' },
                { path: '/two', data: readable('two') },
                { path: '/three', data: 'three' }
            ])).then(() => {
                const body = fixture.requests[0].body;
                body.indexOf('filename="/one"').should.be.below(body.indexOf('filename="/two"'));
                body.indexOf('filename="/two"').should.be.below(body.indexOf('filename="/three"'));
                return sandbox.files.write('/gzip', readable('gzip upload'), { useOctetStream: true, gzip: true });
            }).then(() => {
                fixture.requests[1].headers['content-encoding'].should.eql('gzip');
                zlib.gunzipSync(fixture.requests[1].rawBody).toString().should.eql('gzip upload');
            });
        });

        it('applies upload deadlines and closes an unfinished input stream', function () {
            const source = new stream.Readable({ read: function () {} });
            const server = http.createServer((req, res) => {});
            return new Promise(resolve => server.listen(0, '127.0.0.1', resolve)).then(() => {
                fixture = { server };
                sandbox = new qiniu.sandbox.Sandbox({
                    sandboxId: 'upload-timeout',
                    envdUrl: `http://127.0.0.1:${server.address().port}`,
                    info: { envdAccessToken: 'token' }
                });
                return sandbox.files.write('/slow', source, { requestTimeoutMs: 20 });
            }).then(() => { throw new Error('expected upload timeout'); }, err => {
                err.name.should.eql('TimeoutError');
                source.destroyed.should.eql(true);
            });
        });

        it('preserves upload backpressure while the server is not reading', function () {
            const size = 16 * 1024 * 1024;
            let supplied = 0;
            let suppliedBeforeRead;
            let received = 0;
            const source = new stream.Readable({
                read: function () {
                    if (supplied === size) return this.push(null);
                    supplied += 65536;
                    this.push(Buffer.alloc(65536, 97));
                }
            });
            const server = http.createServer((req, res) => {
                req.pause();
                setTimeout(() => {
                    suppliedBeforeRead = supplied;
                    req.on('data', chunk => { received += chunk.length; });
                    req.on('end', () => {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify([{ path: '/large', type: 'file' }]));
                    });
                    req.resume();
                }, 40);
            });
            return new Promise(resolve => server.listen(0, '127.0.0.1', resolve)).then(() => {
                fixture = { server };
                sandbox = new qiniu.sandbox.Sandbox({
                    sandboxId: 'backpressure',
                    envdUrl: `http://127.0.0.1:${server.address().port}`,
                    info: { envdAccessToken: 'token' }
                });
                return sandbox.files.write('/large', source);
            }).then(() => {
                suppliedBeforeRead.should.be.below(size);
                received.should.be.above(size);
            });
        });
    });

    it('accepts readable file uploads and preserves multipart filenames', function () {
        const path = '/unsafe\\"\r\nfile.txt';
        return startServer((req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify([{ path, type: 'file' }]));
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_upload_stream',
                envdUrl: fixture.endpoint,
                info: { envdAccessToken: 'token' }
            });
            const source = new stream.Readable({ read: function () {} });
            source.push('first');
            source.push('second');
            source.push(null);
            return sandbox.files.write(path, source).then(info => {
                info.path.should.eql(path);
                fixture.requests[0].body.should.containEql('firstsecond');
                fixture.requests[0].body.should.containEql('filename="/unsafe\\\\\\"%0D%0Afile.txt"');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => { throw err; });
            });
        });
    });

    it('returns download streams before the response body completes', function () {
        let responseEnded = false;
        return startServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.write('first');
            setTimeout(() => {
                responseEnded = true;
                res.end('second');
            }, 100);
        }).then(fixture => {
            const sandbox = new qiniu.sandbox.Sandbox({
                sandboxId: 'sbx_stream_download',
                envdUrl: fixture.endpoint,
                info: { envdAccessToken: 'token' }
            });
            return sandbox.files.read('/download', { format: 'stream' }).then(result => {
                responseEnded.should.eql(false);
                return new Promise((resolve, reject) => {
                    const chunks = [];
                    result.on('data', chunk => chunks.push(chunk));
                    result.on('error', reject);
                    result.on('end', () => resolve(Buffer.concat(chunks).toString()));
                });
            }).then(content => {
                content.should.eql('firstsecond');
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => { throw err; });
            });
        });
    });

    it('matches envd raw base64 SHA256 signatures in public file URLs', function () {
        const sandbox = new qiniu.sandbox.Sandbox({
            sandboxId: 'signed-files',
            envdUrl: 'http://127.0.0.1',
            info: { envdAccessToken: 'fixture-access-token' }
        });
        // Independent vectors for envd's path:operation:user:token:expiration protocol.
        const opts = { user: 'alice', signatureExpiration: 2000000000 };
        const path = '/tmp/中文 +/=0';
        parseUrl(sandbox.downloadUrl(path, opts)).searchParams.get('signature')
            .should.eql('v1_vMc5DhN8mQzFJHNDUzyMQoClUDxCzQFGp1VrwNgM/+8');
        parseUrl(sandbox.uploadUrl(path, opts)).searchParams.get('signature')
            .should.eql('v1_fS58L05gcCT2OQ99JleKHrs8V9wzJr+1WHndD9t73ZY');
        parseUrl(sandbox.batchUploadUrl(opts)).searchParams.get('signature')
            .should.eql('v1_FxtqpIN8eaJJ0MCInhlsYzfSfIwT3r37pcHngfMa1Bs');
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

    it('closes upload streams when the destination cannot connect', function () {
        const sandbox = new qiniu.sandbox.Sandbox({
            sandboxId: 'sbx_stream_write',
            envdUrl: 'http://127.0.0.1:9',
            info: {
                envdAccessToken: 'token'
            }
        });

        const source = new stream.Readable({
            read: function () {}
        });
        return sandbox.files.write('/stream.txt', source).then(() => {
            throw new Error('expected stream write to reject');
        }, err => {
            err.code.should.eql('ECONNREFUSED');
            source.destroyed.should.eql(true);
        });
    });

    it('preserves native file-stream cleanup when an upload cannot connect', function () {
        const sandbox = new qiniu.sandbox.Sandbox({
            sandboxId: 'native-stream-write',
            envdUrl: 'http://127.0.0.1:9',
            info: { envdAccessToken: 'token' }
        });
        const source = fs.createReadStream(__filename, { highWaterMark: 1 });
        const closed = new Promise(resolve => source.once('close', resolve));
        return sandbox.files.write('/stream.txt', source).then(() => {
            throw new Error('expected stream write to reject');
        }, err => {
            err.code.should.eql('ECONNREFUSED');
            return closed;
        }).then(() => {
            source.destroyed.should.eql(true);
            should(source.fd).eql(null);
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
                        {
                            path: '/stream.txt',
                            data: new stream.Readable({
                                read: function () { this.emit('error', new Error('source read failed')); }
                            })
                        }
                    ]).then(() => {
                        throw new Error('expected writeFiles stream data to fail');
                    }, err => {
                        err.message.should.eql('source read failed');
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
