const {
    should,
    fs,
    qiniu,
    startServer,
    closeServer
} = require('./sandbox_helpers');

describe('test sandbox template module', function () {
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
                accessKey: 'ak',
                secretKey: 'sk',
                macOptions: {
                    disableQiniuTimestampSignature: true
                },
                endpoint: fixture.endpoint,
                timeout: 1000,
                requestTimeoutMs: 1000,
                name: 'node-template:test'
            }).then(result => {
                result.templateID.should.eql('tpl_1');
                const body = JSON.parse(fixture.requests[0].body);
                body.name.should.eql('node-template:test');
                should.not.exist(body.apiKey);
                should.not.exist(body.accessKey);
                should.not.exist(body.secretKey);
                should.not.exist(body.macOptions);
                should.not.exist(body.timeout);
                should.not.exist(body.requestTimeoutMs);
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
                .pipInstall({ g: false })
                .pipInstall([], { g: false })
                .npmInstall('typescript', { dev: true })
                .npmInstall('tsx', { g: true })
                .npmInstall({ dev: true })
                .bunInstall(['elysia'], { dev: true })
                .bunInstall({ dev: true })
                .bunInstall([])
                .bunInstall(undefined, { g: true })
                .aptInstall(['curl'], { noInstallRecommends: true, fixMissing: true })
                .gitClone('https://github.com/qiniu/nodejs-sdk.git', '/src/sdk dir', {
                    branch: 'sandbox',
                    depth: 1,
                    user: 'root'
                })
                .gitClone('https://github.com/qiniu/nodejs-sdk.git', {
                    branch: 'sandbox',
                    depth: 1
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
                        { type: 'COPY', args: ['package.json', '/app/'] },
                        { type: 'COPY', args: ['package-lock.json', '/app/'] },
                        { type: 'RUN', args: ['rm -r -f \'/tmp/cache dir\' \'/tmp/old\'', 'root'] },
                        { type: 'RUN', args: ['mv -f \'/tmp/a file\' \'/tmp/b file\''] },
                        { type: 'RUN', args: ['mkdir -p -m 0755 \'/app/data dir\' \'/app/logs\''] },
                        { type: 'RUN', args: ['ln -s -f \'/usr/bin/node\' \'/usr/local/bin/node link\'', 'root'] },
                        { type: 'WORKDIR', args: ['/app'] },
                        { type: 'USER', args: ['node'] },
                        { type: 'ENV', args: ['NODE_ENV', 'production', 'PORT', '8080'] },
                        { type: 'RUN', args: ['pip install --user \'numpy\' \'pandas\''] },
                        { type: 'RUN', args: ['pip install --user .'] },
                        { type: 'RUN', args: ['pip install --user .'] },
                        { type: 'RUN', args: ['npm install --save-dev \'typescript\''] },
                        { type: 'RUN', args: ['npm install -g \'tsx\'', 'root'] },
                        { type: 'RUN', args: ['npm install --save-dev'] },
                        { type: 'RUN', args: ['bun add --dev \'elysia\''] },
                        { type: 'RUN', args: ['bun install'] },
                        { type: 'RUN', args: ['bun install'] },
                        { type: 'RUN', args: ['bun install', 'root'] },
                        { type: 'RUN', args: ['apt-get update && DEBIAN_FRONTEND=noninteractive DEBCONF_NOWARNINGS=yes apt-get install -y --no-install-recommends --fix-missing \'curl\'', 'root'] },
                        { type: 'RUN', args: ['git clone \'https://github.com/qiniu/nodejs-sdk.git\' --branch \'sandbox\' --single-branch --depth \'1\' \'/src/sdk dir\'', 'root'] },
                        { type: 'RUN', args: ['git clone \'https://github.com/qiniu/nodejs-sdk.git\' --branch \'sandbox\' --single-branch --depth \'1\''] },
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
                        { type: 'COPY', args: ['package.json', '/app/'], force: true },
                        { type: 'USER', args: ['node'], force: true }
                    ]);
                }).then(() => closeServer(fixture.server), err => {
                    return closeServer(fixture.server).then(() => {
                        throw err;
                    });
                });
        });
    });

    it('clears stale registry credentials when switching to a public image', function () {
        return startServer((req, res) => {
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ templateID: 'tpl_public', buildID: 'bld_public' }));
        }).then(fixture => {
            return qiniu.sandbox.Template()
                .fromImage('registry.example.com/private/app:latest', {
                    username: 'alice',
                    password: 'secret'
                })
                .fromImage('node:22')
                .build({
                    apiKey: 'sandbox-key',
                    endpoint: fixture.endpoint,
                    name: 'public-template:test'
                }).then(() => {
                    const body = JSON.parse(fixture.requests[0].body);
                    body.buildConfig.fromImage.should.eql('node:22');
                    should.not.exist(body.buildConfig.fromImageRegistry);
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

    it('wraps Dockerfile path read errors with path context', function () {
        const originalReadFileSync = fs.readFileSync;
        fs.readFileSync = function (path) {
            if (path === __filename) {
                throw new Error('permission denied');
            }
            return originalReadFileSync.apply(this, arguments);
        };
        try {
            (() => qiniu.sandbox.Template().fromDockerfile(__filename)).should.throw(/Failed to read Dockerfile/);
        } finally {
            fs.readFileSync = originalReadFileSync;
        }
    });

    it('throws when Dockerfile path does not exist', function () {
        (() => qiniu.sandbox.Template().fromDockerfile('/tmp/missing-qiniu-sdk-Dockerfile')).should.throw(/Dockerfile file not found/);
    });

    it('reads existing custom Dockerfile paths', function () {
        const file = `/tmp/qiniu-sdk-Containerfile-${Date.now()}`;
        fs.writeFileSync(file, 'FROM node:22\nRUN echo ok');
        try {
            const template = qiniu.sandbox.Template().fromDockerfile(file);
            template.buildConfig.fromImage.should.eql('node:22');
            template.buildConfig.steps.should.eql([
                { type: 'run', cmd: 'echo ok' }
            ]);
        } finally {
            fs.unlinkSync(file);
        }
    });

    it('allows single-line Dockerfile comments as content', function () {
        const template = qiniu.sandbox.Template().fromDockerfile('# syntax=docker/dockerfile:1');
        template.buildConfig.steps.should.eql([]);
    });

    it('preserves octal permission strings in Template helpers', function () {
        const template = qiniu.sandbox.Template()
            .copy('app.js', '/app/', { mode: '755' })
            .copy('bin.js', '/app/', { mode: '0o755' })
            .makeDir('/app/cache', { mode: '0755' });

        template.buildConfig.steps.should.eql([
            { type: 'COPY', args: ['app.js', '/app/', '', '0755'] },
            { type: 'COPY', args: ['bin.js', '/app/', '', '0755'] },
            { type: 'RUN', args: ['mkdir -p -m 0755 \'/app/cache\''] }
        ]);
    });

    it('parses escaped quotes in Dockerfile ENV values', function () {
        const template = qiniu.sandbox.Template()
            .fromDockerfile('FROM node:22\nENV FOO="bar\\"baz" QUOTED=\'it\\\'s ok\'\nENV MY_VAR some=value');
        template.buildConfig.steps.should.eql([
            { type: 'ENV', args: ['FOO', 'bar"baz', 'QUOTED', 'it\'s ok'] },
            { type: 'ENV', args: ['MY_VAR', 'some=value'] }
        ]);
    });

    it('joins Dockerfile lines continued with backslash before parsing', function () {
        const template = qiniu.sandbox.Template()
            .fromDockerfile('FROM --platform=linux/amd64 ubuntu:22.04 AS build\nRUN apt-get update && \\\n    apt-get install -y curl\nENV FOO=bar \\\n    BAZ=qux\nENV PORT 3000\nCOPY "file name.txt" "/app/data dir/"');
        template.buildConfig.fromImage.should.eql('ubuntu:22.04');
        template.buildConfig.steps.should.eql([
            { type: 'run', cmd: 'apt-get update &&  apt-get install -y curl' },
            { type: 'ENV', args: ['FOO', 'bar', 'BAZ', 'qux'] },
            { type: 'ENV', args: ['PORT', '3000'] },
            { type: 'COPY', args: ['file name.txt', '/app/data dir/'] }
        ]);
    });

    it('does not continue Dockerfile lines with escaped trailing backslashes', function () {
        const template = qiniu.sandbox.Template()
            .fromDockerfile('FROM node:22\nRUN echo \\\\\nRUN echo next');
        template.buildConfig.steps.should.eql([
            { type: 'run', cmd: 'echo \\\\' },
            { type: 'run', cmd: 'echo next' }
        ]);
    });

    it('does not merge Dockerfile comments or blank lines that end with backslash', function () {
        const template = qiniu.sandbox.Template()
            .fromDockerfile('FROM node:22\n# ignored comment \\\nRUN echo ok\n\nRUN echo next');
        template.buildConfig.steps.should.eql([
            { type: 'run', cmd: 'echo ok' },
            { type: 'run', cmd: 'echo next' }
        ]);
    });

    it('parses JSON Dockerfile COPY args and skips unsupported COPY --from flags', function () {
        const template = qiniu.sandbox.Template()
            .fromDockerfile('FROM node:22\nCOPY ["file name.txt", "/app/data dir/"]\nCOPY --chown=node package.json /app/\nCOPY --link linked.txt /linked/\nCOPY --from=builder /app/dist /app/dist');
        template.buildConfig.steps.should.eql([
            { type: 'COPY', args: ['file name.txt', '/app/data dir/'] },
            { type: 'COPY', args: ['package.json', '/app/'] },
            { type: 'COPY', args: ['linked.txt', '/linked/'] }
        ]);
    });

    it('throws TemplateBuildError when a template build finishes with error status', function () {
        return startServer((req, res) => {
            if (req.url === '/templates/tpl_1/builds/bld_1/status') {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ status: 'error', error: { message: 'compile failed' } }));
                return;
            }
            res.statusCode = 404;
            res.end();
        }).then(fixture => {
            const client = new qiniu.sandbox.SandboxClient({
                endpoint: fixture.endpoint,
                apiKey: 'sandbox-key'
            });

            return client.waitForBuild('tpl_1', 'bld_1', { intervalMs: 1, timeoutMs: 20 }).then(() => {
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

    it('covers Template package helper option branches and build option cleanup', function () {
        const bodySeen = [];
        const client = {
            createTemplateV3: body => {
                bodySeen.push(body);
                return Promise.resolve({ templateID: 'tpl_1' });
            }
        };
        const template = qiniu.sandbox.Template()
            .pipInstall({ g: false })
            .npmInstall({ g: true, dev: true })
            .bunInstall({ g: true })
            .setEnvs({})
            .setStartCmd('npm start')
            .setReadyCmd('curl -f http://localhost:3000');

        return template.build({
            client,
            endpoint: 'https://sandbox.example.com',
            apiKey: 'api-key',
            accessToken: 'access-token',
            accessKey: 'ak',
            secretKey: 'sk',
            timeout: 1,
            requestTimeoutMs: 2000,
            alias: 'tpl-alias'
        }).then(ret => {
            ret.templateID.should.eql('tpl_1');
            bodySeen.length.should.eql(1);
            bodySeen[0].alias.should.eql('tpl-alias');
            should.not.exist(bodySeen[0].client);
            should.not.exist(bodySeen[0].endpoint);
            should.not.exist(bodySeen[0].apiKey);
            should.not.exist(bodySeen[0].accessToken);
            should.not.exist(bodySeen[0].accessKey);
            should.not.exist(bodySeen[0].secretKey);
            should.not.exist(bodySeen[0].timeout);
            should.not.exist(bodySeen[0].requestTimeoutMs);
            bodySeen[0].buildConfig.startCmd.should.eql('npm start');
            bodySeen[0].buildConfig.readyCmd.should.eql('curl -f http://localhost:3000');
            bodySeen[0].buildConfig.steps.should.eql([
                { type: 'RUN', args: ['pip install --user .'] },
                { type: 'RUN', args: ['npm install -g --save-dev', 'root'] },
                { type: 'RUN', args: ['bun install', 'root'] }
            ]);
        });
    });
});
