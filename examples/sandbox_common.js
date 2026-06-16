const fs = require('fs');
const path = require('path');

const qiniu = require('../index');
const { shellQuote } = require('../qiniu/sandbox/util');

function loadDotEnvIfPresent () {
    const files = [
        path.join(process.cwd(), '.env')
    ];

    files.forEach(filepath => {
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
    });
}

function env (key, fallback) {
    return process.env[key] || fallback;
}

function requiredEnv (key) {
    if (process.env[key]) {
        return process.env[key];
    }
    throw new Error(`Please set ${key}`);
}

function sandboxEndpoint () {
    return env('QINIU_SANDBOX_ENDPOINT');
}

function sandboxApiKey () {
    return requiredEnv('QINIU_SANDBOX_API_KEY');
}

function sandboxTemplate () {
    return env('QINIU_SANDBOX_TEMPLATE', 'base');
}

function sandboxClient (options) {
    options = Object.assign({
        endpoint: sandboxEndpoint(),
        apiKey: sandboxApiKey()
    }, options || {});
    return new qiniu.sandbox.SandboxClient(options);
}

function sandboxMac () {
    const accessKey = requiredEnv('QINIU_SANDBOX_ACCESS_KEY');
    const secretKey = requiredEnv('QINIU_SANDBOX_SECRET_KEY');
    return new qiniu.auth.digest.Mac(accessKey, secretKey);
}

function createSandboxAndWait (options, pollOptions) {
    const client = options && options.client ? options.client : sandboxClient();
    const params = Object.assign({
        client,
        template: sandboxTemplate(),
        timeout: 300
    }, options || {});

    return qiniu.sandbox.Sandbox.create(params).then(sandbox => {
        console.log('Sandbox created:', sandbox.sandboxId);
        return sandbox.waitForReady(Object.assign({
            interval: 3000,
            timeout: 180000
        }, pollOptions || {})).then(info => {
            console.log('Sandbox ready:', sandbox.sandboxId, info.state || '');
            return sandbox;
        });
    });
}

function cleanupSandbox (sandbox) {
    if (!sandbox) {
        return Promise.resolve();
    }
    return sandbox.kill()
        .then(() => {
            console.log('Sandbox killed:', sandbox.sandboxId);
        }, err => {
            console.log('Failed to kill sandbox:', sandbox.sandboxId, err.message);
        });
}

function runExample (fn) {
    loadDotEnvIfPresent();
    Promise.resolve()
        .then(fn)
        .catch(err => {
            console.error(err && err.stack ? err.stack : err);
            process.exitCode = 1;
        });
}

module.exports = {
    qiniu,
    shellQuote,
    env,
    requiredEnv,
    sandboxEndpoint,
    sandboxApiKey,
    sandboxTemplate,
    sandboxClient,
    sandboxMac,
    createSandboxAndWait,
    cleanupSandbox,
    runExample
};
