const {
    qiniu,
    env,
    sandboxEndpoint,
    sandboxClient,
    sandboxMac,
    shellQuote,
    cleanupSandbox,
    runExample
} = require('./sandbox_common');

function runGitResourceExample () {
    const repoUrl = env('GIT_REPO_URL');
    const token = env('GITHUB_TOKEN');
    if (!repoUrl || !token) {
        console.log('Skip GitHub repository resource: set GIT_REPO_URL and GITHUB_TOKEN.');
        return Promise.resolve();
    }

    const client = sandboxClient();
    const mountPath = env('QINIU_SANDBOX_GIT_MOUNT_PATH', '/workspace/repo');
    let sandbox;

    return qiniu.sandbox.Sandbox.create({
        client,
        template: env('QINIU_SANDBOX_TEMPLATE', 'base'),
        timeout: 300,
        resources: [
            {
                type: 'github_repository',
                url: repoUrl,
                mount_path: mountPath,
                authorization_token: token
            }
        ],
        metadata: {
            example: 'sandbox_resources_git'
        }
    }).then(created => {
        sandbox = created;
        return sandbox.waitForReady({ interval: 3000, timeout: 180000 });
    }).then(() => {
        console.log('Git resource sandbox ready:', sandbox.sandboxId);
        return sandbox.updateGithubToken(token);
    }).then(() => {
        console.log('GitHub token updated for the running sandbox.');
        return sandbox.commands.run(`ls -la ${shellQuote(mountPath)} | head -20`);
    }).then(result => {
        console.log(result.stdout);
        const filename = `sandbox-resource-write-test-${Date.now()}.txt`;
        return sandbox.files.write(`${mountPath}/${filename}`, `sandbox resource write test\nsandbox=${sandbox.sandboxId}\n`)
            .then(() => sandbox.git.configureUser(mountPath, 'Sandbox Resource Demo', 'sandbox-resource-demo@example.com'))
            .then(() => sandbox.git.add(mountPath, { files: [filename] }))
            .then(() => sandbox.git.commit(mountPath, 'test: update sandbox resource write file'))
            .then(() => sandbox.git.status(mountPath))
            .then(status => {
                console.log(status.raw);
            });
    }).then(() => cleanupSandbox(sandbox), err => {
        return cleanupSandbox(sandbox).then(() => {
            throw err;
        });
    });
}

function runKodoResourceExample () {
    const bucket = env('QINIU_SANDBOX_KODO_BUCKET');
    if (!bucket) {
        console.log('Skip Kodo resource: set QINIU_SANDBOX_KODO_BUCKET.');
        return Promise.resolve();
    }

    const client = new qiniu.sandbox.SandboxClient({
        endpoint: sandboxEndpoint(),
        mac: sandboxMac()
    });
    const mountPath = env('QINIU_SANDBOX_KODO_MOUNT_PATH', '/workspace/kodo');
    const resource = {
        type: 'kodo',
        bucket,
        mount_path: mountPath
    };
    if (env('QINIU_SANDBOX_KODO_PREFIX')) {
        resource.prefix = env('QINIU_SANDBOX_KODO_PREFIX');
    }

    let sandbox;
    const testFile = `sandbox-resource-write-test-${Date.now()}.txt`;
    const testPath = `${mountPath}/${testFile}`;
    const prefix = env('QINIU_SANDBOX_KODO_PREFIX');
    const objectKey = prefix ? `${prefix.replace(/\/+$/, '')}/${testFile}` : testFile;
    return qiniu.sandbox.Sandbox.create({
        client,
        template: env('QINIU_SANDBOX_TEMPLATE', 'base'),
        timeout: 300,
        resources: [resource],
        metadata: {
            example: 'sandbox_resources_kodo'
        }
    }).then(created => {
        sandbox = created;
        return sandbox.waitForReady({ interval: 3000, timeout: 180000 });
    }).then(() => {
        console.log('Kodo resource sandbox ready:', sandbox.sandboxId);
        return sandbox.commands.run(`ls -la ${shellQuote(mountPath)} | head -20`);
    }).then(result => {
        console.log(result.stdout);
        return sandbox.commands.run(`sh -c "echo sandbox-kodo-write-test > ${shellQuote(testPath)} && cat ${shellQuote(testPath)}"`);
    }).then(writeResult => {
        if (writeResult.exitCode !== 0) {
            throw new Error(`Kodo write failed: ${writeResult.stderr || writeResult.stdout}`);
        }
        console.log('Read Kodo resource file:', JSON.stringify(writeResult.stdout));
        console.log('Kodo resource file kept in bucket:', `${bucket}/${objectKey}`);
    }).then(() => cleanupSandbox(sandbox), err => {
        return cleanupSandbox(sandbox).then(() => {
            throw err;
        });
    });
}

runExample(() => {
    return runGitResourceExample().then(runKodoResourceExample);
});
