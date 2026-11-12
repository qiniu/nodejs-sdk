const assert = require('assert');
const { qiniu, startServer, closeServer, parseUrl } = require('./sandbox_helpers');

describe('sandbox public API contract updates', function () {
    let fixture;
    let client;

    afterEach(function () {
        if (fixture) {
            return closeServer(fixture.server).then(() => { fixture = null; });
        }
    });

    function serve (handler) {
        return startServer(handler).then(server => {
            fixture = server;
            client = new qiniu.sandbox.SandboxClient({
                endpoint: fixture.endpoint,
                apiKey: 'api-key',
                maxRetries: 1
            });
        });
    }

    function json (res, value, status) {
        res.statusCode = status || 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(value));
    }

    it('forwards auto-pause, auto-resume and body injection options without mutating callers', function () {
        const injection = { type: 'http', ifBody: { model: 'demo' }, body: { token: 'secret' } };
        return serve((req, res) => json(res, { sandboxID: 'sbx' }, 201))
            .then(() => client.createSandbox({
                autoPause: true,
                autoPauseMemory: false,
                autoResume: { enabled: false },
                injections: [injection]
            })).then(() => client.updateSandboxInjections('sbx', [injection]))
            .then(() => {
                const body = JSON.parse(fixture.requests[0].body);
                assert.strictEqual(body.autoPauseMemory, false);
                assert.deepStrictEqual(body.autoResume, { enabled: false });
                assert.deepStrictEqual(body.injections, [{
                    type: 'http', if_body: { model: 'demo' }, body: { token: 'secret' }
                }]);
                assert.deepStrictEqual(JSON.parse(fixture.requests[1].body).injections, body.injections);
                assert.deepStrictEqual(injection.ifBody, { model: 'demo' });
                return client.createSandbox({ autoResume: { enabled: true } });
            }).then(() => {
                const body = JSON.parse(fixture.requests[2].body);
                assert.deepStrictEqual(body.autoResume, { enabled: true });
                assert.strictEqual(body.autoPauseMemory, undefined);
            });
    });

    it('normalizes body conditions for reusable injection rule creation and updates', function () {
        const injection = { type: 'http', ifBody: { model: 'demo' }, body: { token: 'secret' } };
        return serve((req, res) => json(res, { ruleID: 'rule' }))
            .then(() => {
                client.mac = new qiniu.auth.digest.Mac('ak', 'sk');
                return client.createInjectionRule({ name: 'body-rule', injection });
            }).then(() => client.updateInjectionRule('rule', { injection }))
            .then(() => {
                fixture.requests.forEach(req => {
                    assert.deepStrictEqual(JSON.parse(req.body).injection, {
                        type: 'http', if_body: { model: 'demo' }, body: { token: 'secret' }
                    });
                    assert.ok(req.headers.authorization.indexOf('Qiniu ') === 0);
                });
            });
    });

    it('prefers canonical body conditions when both naming forms are provided', function () {
        return serve((req, res) => { res.statusCode = 204; res.end(); })
            .then(() => client.updateSandboxInjections('sbx', [{
                type: 'http', ifBody: { model: 'alias' }, if_body: { model: 'canonical' }
            }])).then(() => {
                assert.deepStrictEqual(JSON.parse(fixture.requests[0].body).injections, [{
                    type: 'http', if_body: { model: 'canonical' }
                }]);
            });
    });

    it('passes filesystem-only pause through the facade and uses Connect v2 for running and resumed sandboxes', function () {
        let connects = 0;
        return serve((req, res) => {
            if (req.url.endsWith('/pause')) {
                res.statusCode = 204;
                return res.end();
            }
            connects++;
            json(res, { sandboxID: 'sbx/id', envdAccessToken: 'envd-token' }, connects === 1 ? 200 : 201);
        }).then(() => {
            const sandbox = new qiniu.sandbox.Sandbox({ client, sandboxID: 'sbx/id' });
            return sandbox.pause({ memory: false })
                .then(() => sandbox.connect({ timeoutMs: 45000 }))
                .then(value => assert.strictEqual(value, sandbox))
                .then(() => qiniu.sandbox.Sandbox.connect('sbx/id', { client }));
        }).then(() => {
            assert.strictEqual(fixture.requests[0].url, '/sandboxes/sbx%2Fid/pause');
            assert.deepStrictEqual(JSON.parse(fixture.requests[0].body), { memory: false });
            fixture.requests.slice(1).forEach(req => {
                assert.strictEqual(req.method, 'POST');
                assert.strictEqual(req.url, '/v2/sandboxes/sbx%2Fid/connect');
            });
            assert.deepStrictEqual(JSON.parse(fixture.requests[1].body), { timeout: 45 });
            assert.deepStrictEqual(JSON.parse(fixture.requests[2].body), { timeout: 300 });
        });
    });

    it('retries snapshot capture with the same key and body and exposes the names', function () {
        let attempts = 0;
        const opts = { memory: false, name: 'snapshot:v1', idempotencyKey: 'capture-key' };
        return serve((req, res) => {
            attempts++;
            if (attempts === 1) {
                return json(res, { message: 'still capturing', error_code: 'snapshot_wait_timeout' }, 408);
            }
            json(res, { snapshotID: 'snap', names: ['team/snapshot:v1'] }, 201);
        }).then(() => {
            const sandbox = new qiniu.sandbox.Sandbox({ client, sandboxID: 'sbx/id' });
            return sandbox.createSnapshot(opts);
        }).then(snapshot => {
            assert.strictEqual(snapshot.snapshotId, 'snap');
            assert.deepStrictEqual(snapshot.names, ['team/snapshot:v1']);
            assert.strictEqual(fixture.requests.length, 2);
            fixture.requests.forEach(req => {
                assert.strictEqual(req.url, '/sandboxes/sbx%2Fid/snapshots');
                assert.strictEqual(req.headers['idempotency-key'], 'capture-key');
                assert.deepStrictEqual(JSON.parse(req.body), { memory: false, name: 'snapshot:v1' });
            });
            assert.deepStrictEqual(opts, { memory: false, name: 'snapshot:v1', idempotencyKey: 'capture-key' });
        });
    });

    it('generates a fresh snapshot key per capture and sends an empty default body', function () {
        return serve((req, res) => json(res, { snapshotID: 'snap', names: [] }, 201))
            .then(() => client.createSnapshot('sbx'))
            .then(() => client.createSandboxSnapshot('sbx'))
            .then(() => {
                fixture.requests.forEach(req => {
                    assert.ok(/^[0-9a-f-]{36}$/.test(req.headers['idempotency-key']));
                    assert.deepStrictEqual(JSON.parse(req.body), {});
                });
                assert.notStrictEqual(fixture.requests[0].headers['idempotency-key'], fixture.requests[1].headers['idempotency-key']);
            });
    });

    it('rejects invalid snapshot keys before sending a request', function () {
        const offline = new qiniu.sandbox.SandboxClient();
        offline.httpClient.sendRequest = () => { throw new Error('must not send'); };
        return Promise.all(['', 'a'.repeat(129), 123, null].map(idempotencyKey => {
            return offline.createSnapshot('sbx', { idempotencyKey }).then(() => {
                throw new Error('expected invalid key');
            }, err => assert.ok(/idempotencyKey/.test(err.message)));
        }));
    });

    it('preserves semantic error codes and does not retry a conflicting capture', function () {
        return serve((req, res) => json(res, { message: 'different request', error_code: 'idempotency_conflict' }, 409))
            .then(() => client.createSnapshot('sbx', { idempotencyKey: 'conflict' }))
            .then(() => { throw new Error('expected conflict'); }, err => {
                assert.strictEqual(err.data.error_code, 'idempotency_conflict');
                assert.strictEqual(err.response.statusCode, 409);
                assert.strictEqual(fixture.requests.length, 1);
            });
    });

    it('reads snapshot cursors from headers and advances an initial cursor without repeating pages', function () {
        return serve((req, res) => {
            const url = parseUrl(req.url);
            const first = url.searchParams.get('nextToken') === 'initial';
            if (first) res.setHeader('X-Next-Token', 'next+/=');
            json(res, [{ snapshotID: first ? 'snap1' : 'snap2', names: ['team/demo:v1'] }]);
        }).then(() => {
            const sandbox = new qiniu.sandbox.Sandbox({ client, sandboxID: 'sbx/id' });
            const paginator = sandbox.listSnapshots({ limit: 1, name: 'demo:v1', nextToken: 'initial' });
            return paginator.nextItems().then(items => {
                assert.strictEqual(items[0].snapshotId, 'snap1');
                assert.strictEqual(paginator.nextToken, 'next+/=');
                assert.strictEqual(paginator.hasNext, true);
                return paginator.nextItems();
            }).then(items => {
                assert.strictEqual(items[0].snapshotID, 'snap2');
                assert.strictEqual(paginator.hasNext, false);
                return paginator.nextItems();
            }).then(items => {
                assert.deepStrictEqual(items, []);
                assert.strictEqual(fixture.requests.length, 2);
                fixture.requests.forEach(req => {
                    const url = parseUrl(req.url);
                    assert.strictEqual(url.searchParams.get('sandboxID'), 'sbx/id');
                    assert.strictEqual(url.searchParams.get('sandboxId'), null);
                    assert.strictEqual(url.searchParams.get('name'), 'demo:v1');
                });
                assert.strictEqual(parseUrl(fixture.requests[1].url).searchParams.get('nextToken'), 'next+/=');
                return client.listSnapshots({ sandboxId: 'alias' });
            }).then(items => {
                assert.ok(Array.isArray(items));
                assert.strictEqual(parseUrl(fixture.requests[2].url).searchParams.get('sandboxID'), 'alias');
            });
        });
    });

    it('honors per-call snapshot cursors before, during and after pagination', function () {
        return serve((req, res) => {
            const cursor = parseUrl(req.url).searchParams.get('nextToken');
            if (cursor === 'saved') res.setHeader('X-Next-Token', 'after-saved');
            if (cursor === 'override') res.setHeader('X-Next-Token', 'internal');
            json(res, [{ snapshotID: cursor, names: [] }]);
        }).then(() => {
            const paginator = new qiniu.sandbox.SnapshotPaginator(client, { limit: 1 });
            return paginator.nextItems({ nextToken: 'saved' }).then(items => {
                assert.strictEqual(items[0].snapshotID, 'saved');
                return paginator.nextItems({ nextToken: 'override' });
            }).then(items => {
                assert.strictEqual(items[0].snapshotID, 'override');
                return paginator.nextItems();
            }).then(items => {
                assert.strictEqual(items[0].snapshotID, 'internal');
                assert.strictEqual(paginator.hasNext, false);
                return paginator.nextItems();
            }).then(items => {
                assert.deepStrictEqual(items, []);
                assert.strictEqual(fixture.requests.length, 3);
                return paginator.nextItems({ nextToken: 'restart' });
            }).then(items => {
                assert.strictEqual(items[0].snapshotID, 'restart');
                assert.deepStrictEqual(fixture.requests.map(req => parseUrl(req.url).searchParams.get('nextToken')),
                    ['saved', 'override', 'internal', 'restart']);
            });
        });
    });

    it('lists resources and patches a single repository token through the facade', function () {
        const resource = { type: 'github_repository', resource_id: 'res/1', url: 'https://github.com/qiniu/nodejs-sdk', mount_path: '/repo' };
        return serve((req, res) => {
            if (req.method === 'PATCH') {
                res.statusCode = 204;
                return res.end();
            }
            json(res, { resources: [resource] });
        }).then(() => {
            const sandbox = new qiniu.sandbox.Sandbox({ client, sandboxID: 'sbx/id' });
            return sandbox.getResources().then(result => {
                assert.deepStrictEqual(result.resources, [resource]);
                return sandbox.patchResource(result.resources[0].resource_id, { authorization_token: 'new-token' });
            });
        }).then(result => {
            assert.strictEqual(result, null);
            assert.strictEqual(fixture.requests[0].url, '/sandboxes/sbx%2Fid/resources');
            assert.strictEqual(fixture.requests[1].method, 'PATCH');
            assert.strictEqual(fixture.requests[1].url, '/sandboxes/sbx%2Fid/resources/res%2F1');
            assert.deepStrictEqual(JSON.parse(fixture.requests[1].body), { authorization_token: 'new-token' });
        });
    });

    it('allows API key auth for Kodo resources carrying independent credentials', function () {
        return serve((req, res) => json(res, { sandboxID: 'sbx' }, 201))
            .then(() => client.createSandbox({
                resources: [{ type: 'kodo', bucket: 'bucket', mount_path: '/kodo', access_key: 'ak', secret_key: 'sk' }]
            })).then(() => {
                assert.strictEqual(fixture.requests[0].headers.authorization, 'Bearer api-key');
                assert.strictEqual(JSON.parse(fixture.requests[0].body).resources[0].secret_key, 'sk');
            });
    });

    it('deletes persistent snapshots through the template endpoint', function () {
        return serve((req, res) => { res.statusCode = 204; res.end(); })
            .then(() => client.deleteSnapshot('snap/id'))
            .then(result => {
                assert.strictEqual(result, null);
                assert.strictEqual(fixture.requests[0].method, 'DELETE');
                assert.strictEqual(fixture.requests[0].url, '/templates/snap%2Fid');
            });
    });

    it('sends template disk requirements, preserves explicit zero and lists tags', function () {
        return serve((req, res) => {
            if (req.method === 'GET') {
                return json(res, [{ tag: 'latest', buildID: 'build', createdAt: '2026-11-12T00:00:00Z' }]);
            }
            json(res, { templateID: 'tpl', buildID: 'build' }, 201);
        }).then(() => qiniu.sandbox.Template().fromImage('ubuntu:22.04').build({
            client, name: 'demo:v1', minDiskMb: 51200, minFreeDiskMb: 0
        })).then(() => client.createTemplateV3({ name: 'demo:v2', minDiskMb: 0, minFreeDiskMb: 1024 }))
            .then(() => client.listTemplateTags('tpl/id'))
            .then(tags => {
                assert.strictEqual(tags[0].tag, 'latest');
                const body = JSON.parse(fixture.requests[0].body);
                assert.strictEqual(body.minDiskMb, 51200);
                assert.strictEqual(body.minFreeDiskMb, 0);
                assert.strictEqual(body.client, undefined);
                assert.strictEqual(body.diskSizeMB, undefined);
                assert.strictEqual(JSON.parse(fixture.requests[1].body).minDiskMb, 0);
                assert.strictEqual(fixture.requests[2].url, '/templates/tpl%2Fid/tags');
            });
    });
});
