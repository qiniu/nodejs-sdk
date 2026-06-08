const fs = require('fs');
const path = require('path');
const should = require('should');

const qiniu = require('../index');
const { shellQuote } = require('../qiniu/sandbox/util');

function loadDotEnvIfPresent () {
    const filepath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(filepath)) {
        return;
    }

    fs.readFileSync(filepath, 'utf8')
        .split(/\r?\n/)
        .forEach(line => {
            line = line.trim();
            if (!line || line[0] === '#') {
                return;
            }
            const index = line.indexOf('=');
            if (index < 0) {
                return;
            }
            const key = line.slice(0, index).trim();
            let value = line.slice(index + 1).trim();
            if (
                (value[0] === '"' && value[value.length - 1] === '"') ||
                (value[0] === '\'' && value[value.length - 1] === '\'')
            ) {
                value = value.slice(1, -1);
            }
            if (process.env[key] === undefined) {
                process.env[key] = value;
            }
        });
}

loadDotEnvIfPresent();

function truthy (value) {
    return ['1', 'true', 'yes', 'on'].indexOf(String(value || '').toLowerCase()) >= 0;
}

function integrationLog () {
    if (!truthy(process.env.QINIU_SANDBOX_INTEGRATION_VERBOSE)) {
        return;
    }
    const args = Array.prototype.slice.call(arguments);
    args.unshift('[sandbox integration]');
    console.log.apply(console, args);
}

function integrationConfig () {
    return {
        enabled: truthy(process.env.QINIU_SANDBOX_INTEGRATION),
        endpoint: process.env.QINIU_SANDBOX_ENDPOINT,
        apiKey: process.env.QINIU_SANDBOX_API_KEY,
        template: process.env.QINIU_SANDBOX_TEMPLATE || 'base',
        accessKey: process.env.QINIU_SANDBOX_ACCESS_KEY,
        secretKey: process.env.QINIU_SANDBOX_SECRET_KEY,
        testInjectionRules: truthy(process.env.QINIU_SANDBOX_TEST_INJECTION_RULES),
        gitRepoUrl: process.env.GIT_REPO_URL,
        gitUsername: process.env.GIT_USERNAME,
        gitPassword: process.env.GIT_PASSWORD
    };
}

const config = integrationConfig();
const describeIntegration = config.enabled && config.apiKey ? describe : describe.skip;

function authedGitUrl (repoUrl, username, password) {
    const parsed = new URL(repoUrl);
    parsed.username = username;
    parsed.password = password;
    return parsed.toString();
}

function scrubSecrets (text) {
    text = String(text || '');
    [config.gitPassword, config.gitUsername].forEach(secret => {
        if (secret) {
            text = text.split(secret).join('[redacted]');
            text = text.split(encodeURIComponent(secret)).join('[redacted]');
        }
    });
    return text.replace(/https?:\/\/[^@\s]+@/g, 'https://[redacted]@');
}

function hasGitCredentials () {
    return Boolean(config.gitRepoUrl && config.gitUsername && config.gitPassword);
}

function exerciseRemoteGitIfConfigured (sandbox, runID) {
    if (!hasGitCredentials()) {
        integrationLog('skip remote git: set GIT_REPO_URL, GIT_USERNAME, and GIT_PASSWORD to run');
        return Promise.resolve();
    }

    const cloneDir = `/tmp/${runID}-clone`;
    const cloneUrl = authedGitUrl(config.gitRepoUrl, config.gitUsername, config.gitPassword);
    const branch = `nodejs-sdk-it-${runID}`;
    const pushedFile = `${cloneDir}/qiniu-nodejs-sdk-integration-${runID}.txt`;
    const gitOptions = {
        timeout: 120000,
        config: {
            'http.version': 'HTTP/1.1'
        }
    };

    integrationLog('cloning configured git repository', cloneDir);
    return sandbox.git.clone(cloneUrl, Object.assign({}, gitOptions, {
        path: cloneDir,
        depth: 1
    })).then(result => {
        if (result.exitCode !== 0) {
            throw new Error(`git clone failed with exit ${result.exitCode}: ${scrubSecrets(result.stderr || result.stdout)}`);
        }
        result.exitCode.should.eql(0);
        integrationLog('cloned configured git repository', cloneDir);
        return sandbox.git.configureUser(cloneDir, 'qiniu-nodejs-sdk', 'qiniu-nodejs-sdk@example.com', gitOptions);
    }).then(result => {
        result.exitCode.should.eql(0);
        return sandbox.git.createBranch(cloneDir, branch, gitOptions);
    }).then(result => {
        result.exitCode.should.eql(0);
        integrationLog('created git branch', branch);
        return sandbox.files.write(pushedFile, `sandbox integration ${runID}\n`);
    }).then(entry => {
        entry.path.should.eql(pushedFile);
        return sandbox.git.add(cloneDir, {
            files: [path.basename(pushedFile)],
            timeout: gitOptions.timeout,
            config: gitOptions.config
        });
    }).then(result => {
        result.exitCode.should.eql(0);
        return sandbox.git.commit(cloneDir, `test: sandbox integration ${runID}`, gitOptions);
    }).then(result => {
        result.exitCode.should.eql(0);
        integrationLog('committed git branch', branch);
        return sandbox.git.push(cloneDir, Object.assign({}, gitOptions, {
            remote: cloneUrl,
            branch: `HEAD:refs/heads/${branch}`
        }));
    }).then(result => {
        if (result.exitCode !== 0) {
            throw new Error(`git push failed with exit ${result.exitCode}: ${scrubSecrets(result.stderr || result.stdout)}`);
        }
        result.exitCode.should.eql(0);
        integrationLog('pushed git branch', branch);
        return sandbox.commands.run(`git -C ${shellQuote(cloneDir)} remote set-url origin ${shellQuote(config.gitRepoUrl)}`);
    }).then(result => {
        result.exitCode.should.eql(0);
        return sandbox.git.remoteGet(cloneDir, 'origin');
    }).then(remoteUrl => {
        remoteUrl.should.eql(config.gitRepoUrl);
        integrationLog('sanitized git remote url', cloneDir);
        return sandbox.git.status(cloneDir);
    }).then(status => {
        status.raw.should.be.String();
        integrationLog('verified cloned git status', cloneDir);
    });
}

describeIntegration('sandbox integration', function () {
    this.timeout(600000);

    let sandbox;

    after(function () {
        if (!sandbox) {
            return null;
        }
        return sandbox.kill()
            .catch(err => {
                console.log('failed to cleanup sandbox', sandbox.sandboxId, err.message);
            });
    });

    it('creates a sandbox and exercises files, commands, and git', function () {
        const client = new qiniu.sandbox.SandboxClient({
            endpoint: config.endpoint,
            apiKey: config.apiKey
        });
        const runID = `nodejs-sdk-${Date.now()}`;
        const workdir = `/tmp/${runID}`;
        const filePath = `${workdir}/hello.txt`;

        return qiniu.sandbox.Sandbox.create({
            client,
            template: config.template,
            timeout: 300,
            metadata: {
                sdk: 'qiniu-nodejs-sdk',
                test: runID
            }
        }).then(created => {
            sandbox = created;
            sandbox.sandboxId.should.be.String();
            integrationLog('created sandbox', sandbox.sandboxId);
            return sandbox.waitForReady({
                interval: 3000,
                timeout: 180000
            });
        }).then(info => {
            info.state.should.eql('running');
            integrationLog('sandbox ready', sandbox.sandboxId);
            return sandbox.isRunning();
        }).then(running => {
            running.should.eql(true);
            integrationLog('envd health ok', sandbox.sandboxId);
            return sandbox.commands.run(`mkdir -p ${workdir}`);
        }).then(result => {
            result.exitCode.should.eql(0);
            integrationLog('created workdir', workdir);
            return sandbox.files.write(filePath, 'hello sandbox');
        }).then(entry => {
            entry.path.should.eql(filePath);
            integrationLog('wrote file', filePath);
            return sandbox.files.readText(filePath);
        }).then(text => {
            text.should.eql('hello sandbox');
            integrationLog('read file', filePath);
            return sandbox.commands.run(`cat ${filePath}`);
        }).then(result => {
            result.exitCode.should.eql(0);
            result.stdout.should.containEql('hello sandbox');
            integrationLog('ran cat command', filePath);
            return sandbox.git.init(workdir);
        }).then(result => {
            result.exitCode.should.eql(0);
            integrationLog('initialized git repo', workdir);
            return sandbox.git.status(workdir);
        }).then(status => {
            status.raw.should.be.String();
            status.untrackedFiles.should.containEql('hello.txt');
            sandbox.getHost(8080).should.be.String();
            integrationLog('verified git status', workdir);
            return exerciseRemoteGitIfConfigured(sandbox, runID);
        });
    });

    it('creates and deletes an injection rule when AK/SK integration is enabled', function () {
        if (!config.testInjectionRules || !config.accessKey || !config.secretKey) {
            this.skip();
        }

        const client = new qiniu.sandbox.SandboxClient({
            endpoint: config.endpoint,
            apiKey: config.apiKey,
            mac: new qiniu.auth.digest.Mac(config.accessKey, config.secretKey)
        });
        const name = `nodejs-sdk-it-${Date.now()}`;
        let ruleID;

        return client.createInjectionRule({
            name,
            injection: {
                type: 'openai',
                apiKey: 'test-key'
            }
        }).then(rule => {
            ruleID = rule.id || rule.ruleID || rule.ruleId;
            should(ruleID).be.ok();
            return client.getInjectionRule(ruleID);
        }).then(rule => {
            rule.name.should.eql(name);
            return client.updateInjectionRule(ruleID, {
                name: name + '-updated'
            });
        }).then(rule => {
            rule.name.should.eql(name + '-updated');
            return client.deleteInjectionRule(ruleID);
        });
    });
});

if (!config.enabled || !config.apiKey) {
    console.log('skip sandbox integration: set QINIU_SANDBOX_INTEGRATION=true and QINIU_SANDBOX_API_KEY to run');
}
