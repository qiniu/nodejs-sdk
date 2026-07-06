const {
    should,
    qiniu,
    startServer,
    closeServer,
    parseUrl
} = require('./sandbox_helpers');

describe('test sandbox client module', function () {
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
                        apiKey: 'ak',
                        baseUrl: 'https://example.com',
                        ifHeaders: {
                            'X-Provider': 'qiniu'
                        },
                        ifQueries: {
                            model: 'default'
                        },
                        ruleId: 'rule_1'
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
                            api_key: 'ak',
                            base_url: 'https://example.com',
                            if_headers: {
                                'X-Provider': 'qiniu'
                            },
                            if_queries: {
                                model: 'default'
                            },
                            ruleID: 'rule_1'
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

    it('passes client timeout to urllib requests and validates metrics ids', function () {
        const client = new qiniu.sandbox.SandboxClient({
            endpoint: 'http://sandbox.test',
            apiKey: 'sandbox-key',
            timeout: 1234
        });
        const urls = [];
        client.httpClient.sendRequest = req => {
            urls.push(req.url);
            req.urllibOptions.timeout.should.eql(1234);
            should.not.exist(req.urllibOptions.headers['Content-Length']);
            should.not.exist(req.urllibOptions.contentType);
            return Promise.resolve({
                ok: () => true,
                data: { ok: true }
            });
        };

        return client.listSandboxes()
            .then(() => client.getSandboxesMetrics().then(() => {
                throw new Error('expected empty metrics ids to fail');
            }, err => {
                err.name.should.eql('SandboxError');
                err.message.should.match(/At least one sandbox ID/);
            }))
            .then(() => client.getSandboxesMetrics('sbx_one'))
            .then(() => client.getSandboxesMetrics({ sandbox_ids: 'sbx_field' }))
            .then(() => client.getSandboxesMetrics({ sandboxId: 'sbx_object' }))
            .then(() => client.getSandboxesMetrics([{ sandboxID: 'sbx_array_object' }, 'sbx_array_string']))
            .then(() => {
                urls.should.eql([
                    'http://sandbox.test/sandboxes',
                    'http://sandbox.test/sandboxes/metrics?sandbox_ids=sbx_one',
                    'http://sandbox.test/sandboxes/metrics?sandbox_ids=sbx_field',
                    'http://sandbox.test/sandboxes/metrics?sandbox_ids=sbx_object',
                    'http://sandbox.test/sandboxes/metrics?sandbox_ids=sbx_array_object%2Csbx_array_string'
                ]);
            });
    });

    it('throws a clear error when Qiniu-auth APIs are called without AK/SK credentials', function () {
        const client = new qiniu.sandbox.SandboxClient({
            endpoint: 'http://sandbox.test',
            apiKey: 'sandbox-key'
        });

        (() => new qiniu.sandbox.SandboxClient({
            endpoint: 'http://sandbox.test',
            apiKey: 'sandbox-key',
            accessKey: 'ak'
        })).should.throw(/Both accessKey and secretKey/);
        const mac = new qiniu.auth.digest.Mac('ak', 'sk');
        const clientWithMac = new qiniu.sandbox.SandboxClient({
            endpoint: 'http://sandbox.test',
            apiKey: 'sandbox-key',
            accessKey: 'ak',
            mac
        });
        clientWithMac.mac.should.equal(mac);

        return client.listInjectionRules().then(() => {
            throw new Error('expected missing Qiniu credentials rejection');
        }, err => {
            err.name.should.eql('SandboxError');
            err.message.should.eql('Qiniu Mac credentials (accessKey/secretKey) are required for this operation');
        });
    });

    it('requires Qiniu AK/SK before creating sandboxes with Kodo resources', function () {
        const client = new qiniu.sandbox.SandboxClient({
            endpoint: 'http://sandbox.test',
            apiKey: 'sandbox-key'
        });

        return client.createSandbox({
            template: 'base',
            resources: [{
                type: 'kodo',
                bucket: 'bucket',
                mountPath: '/workspace/kodo'
            }]
        }).then(() => {
            throw new Error('expected missing Qiniu credentials error');
        }, err => {
            err.name.should.eql('SandboxError');
            err.message.should.eql('Qiniu Mac credentials (accessKey/secretKey) are required for this operation');
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

    it('keeps sandbox lifetime timeout separate from HTTP request timeout in static helpers', function () {
        return startServer((req, res) => {
            setTimeout(() => {
                res.statusCode = 201;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    sandboxID: 'sbx_timeout',
                    domain: 'sbx.local',
                    envdAccessToken: 'token'
                }));
            }, 40);
        }).then(fixture => {
            return qiniu.sandbox.Sandbox.create({
                apiKey: 'sandbox-key',
                endpoint: fixture.endpoint,
                template: 'base',
                timeout: 30
            }).then(sandbox => {
                sandbox.sandboxId.should.eql('sbx_timeout');
                JSON.parse(fixture.requests[0].body).timeout.should.eql(30);
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
                    apiKey: 'secret',
                    baseUrl: 'https://api.openai.com/v1/*',
                    ifHeaders: {
                        'X-Use-Injected-Key': 'true'
                    },
                    ifQueries: {
                        source: 'sdk-test'
                    }
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
                        api_key: 'secret',
                        base_url: 'https://api.openai.com/v1/*',
                        if_headers: {
                            'X-Use-Injected-Key': 'true'
                        },
                        if_queries: {
                            source: 'sdk-test'
                        }
                    }
                });
            }).then(() => closeServer(fixture.server), err => {
                return closeServer(fixture.server).then(() => {
                    throw err;
                });
            });
        });
    });

    it('uses the signing default content type for Qiniu-auth GET requests without a body', function () {
        return startServer((req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                id: 'rule_1',
                name: 'openai',
                injection: {
                    type: 'openai'
                }
            }));
        }).then(fixture => {
            const client = new qiniu.sandbox.SandboxClient({
                endpoint: fixture.endpoint,
                mac: new qiniu.auth.digest.Mac('ak', 'sk', {
                    disableQiniuTimestampSignature: true
                })
            });

            return client.getInjectionRule('rule_1').then(() => {
                fixture.requests[0].method.should.eql('GET');
                fixture.requests[0].url.should.eql('/injection-rules/rule_1');
                should(fixture.requests[0].headers.authorization).startWith('Qiniu ak:');
                fixture.requests[0].headers['content-type'].should.eql('application/x-www-form-urlencoded');
            }).then(() => closeServer(fixture.server), err => {
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

            return client.deleteSandbox().then(() => {
                throw new Error('expected missing sandboxID to fail');
            }, err => {
                err.name.should.eql('SandboxError');
                err.message.should.match(/sandboxID is required/);
            }).then(() => client.list({
                metadata: 'user=alice',
                state: ['running', 'paused'],
                limit: 10,
                nextToken: 'n1'
            })).then(() => client.getInfo('sbx_1'))
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
                    return client.getSandbox('');
                })
                .then(() => {
                    throw new Error('expected missing sandboxID to fail');
                }, err => {
                    err.name.should.eql('SandboxError');
                    err.message.should.eql('sandboxID is required');
                })
                .then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
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

    it('rejects missing sandbox ids and encodes nested template file paths', function () {
        const client = new qiniu.sandbox.SandboxClient({
            endpoint: 'http://sandbox.test',
            apiKey: 'sandbox-key'
        });
        const requests = [];
        client.httpClient.sendRequest = req => {
            requests.push(req);
            return Promise.resolve({
                ok: () => true,
                data: { ok: true }
            });
        };

        return client.getSandbox('').then(() => {
            throw new Error('expected getSandbox to reject missing id');
        }, err => {
            err.name.should.eql('SandboxError');
            err.message.should.eql('sandboxID is required');
            return client.deleteSandbox('');
        }).then(() => {
            throw new Error('expected deleteSandbox to reject missing id');
        }, err => {
            err.name.should.eql('SandboxError');
            err.message.should.eql('sandboxID is required');
            return client.getSandboxLogs('sbx/with space', { cursor: 'next/page' });
        }).then(() => client.getTemplateFiles('tpl/with space', 'dir/file hash'))
            .then(() => {
                requests.map(req => req.url).should.eql([
                    'http://sandbox.test/sandboxes/sbx%2Fwith%20space/logs?cursor=next%2Fpage',
                    'http://sandbox.test/templates/tpl%2Fwith%20space/files/dir%2Ffile%20hash'
                ]);
            });
    });
});
