const path = require('path');

const {
    env,
    shellQuote,
    createSandboxAndWait,
    cleanupSandbox,
    runExample
} = require('./sandbox_common');

function remoteGitConfigured () {
    return gitRepoUrl() && gitUsername() && gitPassword();
}

function gitRepoUrl () {
    return env('GIT_REPO_URL');
}

function gitUsername () {
    return env('GIT_USERNAME');
}

function gitPassword () {
    return env('GIT_PASSWORD');
}

function assertGitOK (step, result) {
    if (!result || result.exitCode !== 0) {
        throw new Error(`${step} failed with exit ${result && result.exitCode}: ${(result && (result.stderr || result.stdout)) || ''}`);
    }
    console.log(`${step}:`, result.exitCode);
    return result;
}

runExample(() => {
    let sandbox;
    let defaultBranch = 'master';
    const repoPath = '/tmp/qiniu-nodejs-sdk-git/repo';
    const remotePath = '/tmp/qiniu-nodejs-sdk-git/remote.git';
    const clonePath = '/tmp/qiniu-nodejs-sdk-git/clone';

    return createSandboxAndWait({
        metadata: {
            example: 'sandbox_git'
        }
    }).then(created => {
        sandbox = created;
        return sandbox.commands.run('mkdir -p /tmp/qiniu-nodejs-sdk-git /tmp/qiniu-nodejs-sdk-git/repo /tmp/qiniu-nodejs-sdk-git/remote.git');
    }).then(() => {
        return sandbox.git.init(repoPath);
    }).then(result => {
        assertGitOK('git init', result);
        return sandbox.git.init(remotePath, { bare: true });
    }).then(result => {
        assertGitOK('git init --bare', result);
        return sandbox.git.configureUser(repoPath, 'Sandbox Demo', 'sandbox-demo@example.com');
    }).then(result => {
        assertGitOK('configure user', result);
        return sandbox.files.write(`${repoPath}/README.md`, '# sandbox git demo\n');
    }).then(() => {
        return sandbox.git.add(repoPath, { all: true });
    }).then(result => {
        assertGitOK('git add', result);
        return sandbox.git.commit(repoPath, 'feat: initial commit', {
            authorName: 'Sandbox Demo',
            authorEmail: 'sandbox-demo@example.com'
        });
    }).then(result => {
        assertGitOK('commit', result);
        return sandbox.git.status(repoPath);
    }).then(status => {
        defaultBranch = status.currentBranch || defaultBranch;
        return sandbox.git.remoteAdd(repoPath, 'origin', remotePath, { overwrite: true });
    }).then(() => {
        return sandbox.git.push(repoPath, { remote: 'origin', branch: defaultBranch });
    }).then(result => {
        assertGitOK('push local bare remote', result);
        return sandbox.git.clone(remotePath, { path: clonePath });
    }).then(result => {
        assertGitOK('clone local bare remote', result);
        return sandbox.git.branches(clonePath);
    }).then(branches => {
        console.log('branches:', branches);
        return sandbox.git.configureUser(clonePath, 'Sandbox Demo', 'sandbox-demo@example.com');
    }).then(result => {
        assertGitOK('configure clone user', result);
        return sandbox.git.createBranch(clonePath, 'feature/example');
    }).then(result => {
        assertGitOK('create branch', result);
        return sandbox.files.write(`${clonePath}/feature.txt`, 'hello feature\n');
    }).then(() => {
        return sandbox.git.add(clonePath, { files: ['feature.txt'] });
    }).then(result => {
        assertGitOK('git add feature', result);
        return sandbox.git.commit(clonePath, 'feat: add feature file', { allowEmpty: false });
    }).then(result => {
        assertGitOK('commit feature', result);
        return sandbox.git.status(clonePath);
    }).then(status => {
        console.log('status raw:\n' + status.raw);
        return sandbox.git.checkoutBranch(clonePath, defaultBranch);
    }).then(result => {
        assertGitOK('checkout default branch', result);
        return sandbox.git.deleteBranch(clonePath, 'feature/example', { force: true });
    }).then(result => {
        assertGitOK('delete branch', result);
        return sandbox.files.write(`${clonePath}/dirty.txt`, 'dirty\n');
    }).then(() => {
        return sandbox.git.add(clonePath, { files: ['dirty.txt'] });
    }).then(result => {
        assertGitOK('git add dirty', result);
        return sandbox.git.restore(clonePath, { staged: true, paths: ['dirty.txt'] });
    }).then(result => {
        assertGitOK('restore staged', result);
        return sandbox.git.reset(clonePath, { hard: true, ref: 'HEAD' });
    }).then(result => {
        assertGitOK('reset hard', result);
        if (!remoteGitConfigured()) {
            console.log('Skip HTTPS clone: set GIT_REPO_URL, GIT_USERNAME and GIT_PASSWORD.');
            return null;
        }

        const remoteRepo = gitRepoUrl();
        const remoteClonePath = '/tmp/qiniu-nodejs-sdk-git/remote-clone';
        const remoteGitOptions = {
            timeout: 120000,
            config: {
                'http.version': 'HTTP/1.1'
            }
        };
        return sandbox.git.clone(remoteRepo, {
            path: remoteClonePath,
            depth: 1,
            username: gitUsername(),
            password: gitPassword(),
            timeout: remoteGitOptions.timeout,
            config: remoteGitOptions.config
        }).then(cloneResult => {
            assertGitOK('HTTPS clone', cloneResult);
            return sandbox.git.remoteGet(remoteClonePath, 'origin');
        }).then(origin => {
            console.log('sanitized origin:', origin);
            const filename = `nodejs-sdk-example-${Date.now()}.txt`;
            const branch = `nodejs-sdk-example-${Date.now()}`;
            return sandbox.git.configureUser(remoteClonePath, 'Sandbox Demo', 'sandbox-demo@example.com')
                .then(result => {
                    assertGitOK('configure remote clone user', result);
                    return sandbox.git.createBranch(remoteClonePath, branch);
                })
                .then(result => {
                    assertGitOK('create remote push branch', result);
                    return sandbox.files.write(path.join(remoteClonePath, filename), 'sandbox git push example\n');
                })
                .then(() => sandbox.git.add(remoteClonePath, { files: [filename] }))
                .then(result => {
                    assertGitOK('add remote push file', result);
                    return sandbox.git.commit(remoteClonePath, 'test: sandbox git example');
                })
                .then(result => {
                    assertGitOK('commit remote push file', result);
                    return sandbox.git.status(remoteClonePath);
                })
                .then(status => {
                    console.log('remote clone status raw:\n' + status.raw);
                });
        });
    }).then(() => {
        return sandbox.commands.run(`find ${shellQuote('/tmp/qiniu-nodejs-sdk-git')} -maxdepth 2 -type d | sort`);
    }).then(result => {
        console.log(result.stdout);
        return cleanupSandbox(sandbox);
    }, err => {
        return cleanupSandbox(sandbox).then(() => {
            throw err;
        });
    });
});
