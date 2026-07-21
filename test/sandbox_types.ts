import * as qiniu from '../index';

async function useSandboxTypes () {
    const client = new qiniu.sandbox.SandboxClient({
        endpoint: 'https://sandbox.example.com',
        apiKey: 'key'
    });

    const kodoResource: qiniu.sandbox.KodoResource = {
        type: 'kodo',
        bucket: 'bucket',
        mount_path: '/mnt/kodo',
        prefix: 'prefix',
        read_only: true
    };
    const gitResource: qiniu.sandbox.GitRepositoryResource = {
        type: 'github_repository',
        url: 'https://github.com/qiniu/nodejs-sdk',
        mount_path: '/workspace/repo',
        authorization_token: 'token'
    };
    const qiniuInjection: qiniu.sandbox.QiniuInjection = {
        type: 'qiniu',
        apiKey: 'sandbox-qiniu-ai-key',
        baseUrl: 'https://api.qnaigc.com/v1/*',
        ifHeaders: {
            'X-Use-Injected-Key': 'true'
        },
        ifQueries: {
            model: 'qiniu-default'
        }
    };
    const githubInjection: qiniu.sandbox.GithubInjection = {
        type: 'github',
        token: 'github-token',
        base_url: 'https://api.github.com/repos/qiniu/*',
        if_headers: {
            Accept: 'application/vnd.github+json'
        },
        if_queries: {
            per_page: '100'
        }
    };

    const sandbox = await qiniu.Sandbox.create('base', {
        client,
        resources: [kodoResource, gitResource],
        injections: [
            { type: 'id', id: 'rule_1' },
            { injectionRuleID: 'rule_2' },
            qiniuInjection,
            githubInjection
        ],
        network: {
            allowOut: [qiniu.sandbox.ALL_TRAFFIC]
        }
    });

    const timeoutMs: number = qiniu.DEFAULT_SANDBOX_TIMEOUT_MS;
    const fileType: 'file' = qiniu.FileType.FILE;
    const eventType: 'write' = qiniu.FilesystemEventType.WRITE;
    await sandbox.connect({ timeoutMs });
    await sandbox.betaPause();
    const bytes: Buffer = await sandbox.files.read('/tmp/a.bin', { format: 'bytes' });
    const text: string = await sandbox.files.read('/tmp/a.txt', { format: 'text' });
    const stream: NodeJS.ReadableStream = await sandbox.files.read('/tmp/a.txt', { format: 'stream' });
    const watchHandle = await sandbox.files.watchDir('/tmp', event => {
        const eventName: string = event.name;
        const eventKind: 'create' | 'write' | 'remove' | 'rename' | 'chmod' = event.type;
        eventName.length;
        eventKind.length;
    }, {
        recursive: true,
        requestTimeoutMs: 1000,
        onExit: err => {
            if (err) {
                err.message.length;
            }
        }
    });
    await watchHandle.stop();
    const handle = await sandbox.commands.connect(123);
    await handle.disconnect();
    await sandbox.commands.run('false', {
        requestTimeoutMs: 1000,
        throwOnError: true
    });
    await sandbox.git.clone('https://github.com/qiniu/nodejs-sdk', '/repo', {
        depth: 1,
        username: 'u',
        password: 'p'
    });
    await sandbox.git.push('/repo', {
        remote: 'origin',
        branch: 'main',
        username: 'u',
        password: 'p'
    });
    await sandbox.git.setConfig('user.name', 'Alice', { path: '/repo', scope: 'local' });
    const gitUser: string | undefined = await sandbox.git.getConfig('user.name', { path: '/repo', scope: 'local' });
    await sandbox.git.configureUser('Alice', 'alice@example.com', { path: '/repo', scope: 'local' });
    await sandbox.git.reset('/repo', { mode: 'hard', target: 'HEAD~1' });
    await sandbox.git.restore('/repo', { paths: ['a.txt'] });
    const template = qiniu.sandbox.Template()
        .fromImage('ubuntu:22.04')
        .aptInstall(['git'])
        .runCmd('git --version');
    qiniu.sandbox.Template()
        .skipCache()
        .fromImage('registry.example.com/app:latest', { username: 'u', password: 'p' })
        .fromAWSRegistry('123456789.dkr.ecr.us-west-2.amazonaws.com/app:latest', {
            accessKeyId: 'ak',
            secretAccessKey: 'sk',
            region: 'us-west-2'
        })
        .fromGCPRegistry('gcr.io/project/app:latest', {
            serviceAccountJSON: { project_id: 'project' }
        })
        .fromDockerfile('FROM node:22\nRUN npm ci')
        .copyItems([{ src: ['package.json'], dest: '/app/', mode: 0o644 }])
        .remove('/tmp/cache', { recursive: true, force: true })
        .rename('/tmp/a', '/tmp/b')
        .makeDir(['/app/data'], { mode: 0o755 })
        .makeSymlink('/usr/bin/node', '/usr/local/bin/node', { force: true })
        .setWorkdir('/app')
        .setUser('node')
        .setEnvs({ NODE_ENV: 'production' })
        .pipInstall({ g: false })
        .pipInstall(['numpy'], { g: false })
        .npmInstall({ dev: true })
        .npmInstall('typescript', { dev: true })
        .bunInstall({ dev: true })
        .bunInstall(undefined, { g: true })
        .gitClone('https://github.com/qiniu/nodejs-sdk.git', { branch: 'sandbox', depth: 1 })
        .gitClone('https://github.com/qiniu/nodejs-sdk.git', '/src/sdk', { branch: 'sandbox', depth: 1 })
        .runCmd(['echo one', 'echo two'], { user: 'root' });
    await template.build({ client, name: 'typed-template:test' });
    await sandbox.updateNetwork({ allowOut: [qiniu.sandbox.ALL_TRAFFIC] });
    const injections: qiniu.sandbox.SandboxInjection[] = (await sandbox.getInjections()).injections;
    await sandbox.updateInjections(injections);
    await sandbox.updateGithubToken('github-token');
    const templateInfo: qiniu.sandbox.TemplateWithBuilds = await client.getTemplate('typed-template');
    const templateNames: string[] = templateInfo.names;
    const isOwner: boolean = templateInfo.isOwner;
    qiniu.Sandbox.list({ client, query: { template: templateNames } });
    qiniu.CommandExitError.name;
    bytes.length;
    text.length;
    stream.read;
    fileType.length;
    eventType.length;
    if (gitUser) {
        gitUser.length;
    }
    if (isOwner) {
        isOwner.valueOf();
    }
}

void useSandboxTypes;
