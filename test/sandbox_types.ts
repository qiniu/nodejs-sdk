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

    const sandbox = await qiniu.Sandbox.create('base', {
        client,
        resources: [kodoResource, gitResource],
        network: {
            allowOut: [qiniu.sandbox.ALL_TRAFFIC]
        }
    });

    const bytes: Buffer = await sandbox.files.read('/tmp/a.bin', { format: 'bytes' });
    const text: string = await sandbox.files.read('/tmp/a.txt', { format: 'text' });
    const stream: NodeJS.ReadableStream = await sandbox.files.read('/tmp/a.txt', { format: 'stream' });
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
    const template = qiniu.sandbox.Template()
        .fromImage('ubuntu:22.04')
        .aptInstall(['git'])
        .runCmd('git --version');
    await template.build({ client, name: 'typed-template:test' });
    await sandbox.updateNetwork({ allowOut: [qiniu.sandbox.ALL_TRAFFIC] });
    await qiniu.CommandExitError;
    bytes.length;
    text.length;
    stream.read;
}

void useSandboxTypes;
