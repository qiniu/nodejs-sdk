import * as qiniu from '../index';
import {Readable} from 'stream';

type IsAny<T> = 0 extends (1 & T) ? true : false;
type AssertFalse<T extends false> = T;
type AssertNever<T extends never> = T;
type BodyOptionKeys<T> = T extends unknown ? Extract<keyof T, 'body' | 'ifBody' | 'if_body'> : never;
type ProviderInjection = Exclude<qiniu.sandbox.Injection, qiniu.sandbox.HttpInjection>;
type ProviderBodyOptions = AssertNever<BodyOptionKeys<ProviderInjection>>;
type ResourceSecretKeys<T> = T extends unknown ? Extract<keyof T, 'authorization_token' | 'access_key' | 'secret_key'> : never;
type ResourceResponseSecrets = AssertNever<ResourceSecretKeys<qiniu.sandbox.SandboxResourceInfo>>;

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
        read_only: true,
        access_key: 'ak',
        secret_key: 'sk'
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
    const httpInjection: qiniu.sandbox.HttpInjection = {
        type: 'http',
        ifBody: { model: 'demo' },
        if_body: { model: 'demo' },
        body: { token: 'secret' }
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
        autoPause: true,
        autoPauseMemory: false,
        autoResume: { enabled: false },
        resources: [kodoResource, gitResource],
        injections: [
            { type: 'id', id: 'rule_1' },
            { injectionRuleID: 'rule_2' },
            qiniuInjection,
            httpInjection,
            githubInjection
        ],
        network: {
            allowOut: [qiniu.sandbox.ALL_TRAFFIC]
        }
    });
    const serviceToken: string | undefined = sandbox.trafficAccessToken;
    const sandboxPage = await client.listSandboxes({ limit: 2 });
    const sandboxPageIsTyped: AssertFalse<IsAny<typeof sandboxPage>> = false;
    const sandboxCursor: string | undefined = sandboxPage.nextToken;
    const sandboxAliasPage: qiniu.sandbox.SandboxPage = await client.list({ limit: 2 });
    await qiniu.Sandbox.list({ client }).nextItems({ nextToken: 'saved-cursor' });

    const timeoutMs: number = qiniu.DEFAULT_SANDBOX_TIMEOUT_MS;
    const fileType: 'file' = qiniu.FileType.FILE;
    const eventType: 'write' = qiniu.FilesystemEventType.WRITE;
    await sandbox.connect({ timeoutMs });
    await sandbox.betaPause({ memory: false });
    await sandbox.pause({ memory: true });
    await client.connectSandboxV2(sandbox.sandboxID);
    const snapshot = await sandbox.createSnapshot({ name: 'demo:v1', memory: false, idempotencyKey: 'capture-key' });
    const snapshotID: string = snapshot.snapshotID;
    const snapshotNames: string[] = snapshot.names;
    const snapshotPage = await client.listSnapshots({ name: 'demo:v1', sandboxID: sandbox.sandboxID });
    const snapshotPageIsTyped: AssertFalse<IsAny<typeof snapshotPage>> = false;
    const snapshots: qiniu.sandbox.SnapshotInfo[] = snapshotPage.items;
    const snapshotItems: qiniu.sandbox.SnapshotInfo[] = await sandbox.listSnapshots({ limit: 10 }).nextItems();
    await sandbox.listSnapshots({ limit: 10 }).nextItems({ nextToken: 'saved-cursor' });
    type Snapshot = typeof snapshotItems[number];
    const snapshotIsTyped: AssertFalse<IsAny<Snapshot>> = false;
    const tags: qiniu.sandbox.TemplateTag[] = await client.listTemplateTags(snapshotID);
    const resources: qiniu.sandbox.SandboxResourcesResponse = await sandbox.getResources();
    const resourceID: string = resources.resources[0].resource_id;
    if (resourceID) {
        await sandbox.updateGitRepositoryResourceToken(resourceID, 'new-token');
    }
    snapshotNames.length;
    snapshotPage.items.length;
    sandboxPageIsTyped.valueOf();
    snapshotPageIsTyped.valueOf();
    sandboxAliasPage.items.length;
    snapshots.length;
    tags[0].createdAt.length;
    snapshotIsTyped.valueOf();
    const bytes: Buffer = await sandbox.files.read('/tmp/a.bin', { format: 'bytes' });
    const text: string = await sandbox.files.read('/tmp/a.txt', { format: 'text' });
    const stream: NodeJS.ReadableStream = await sandbox.files.read('/tmp/a.txt', { format: 'stream' });
    const upload = new Readable({read() {}});
    const download: Readable = await sandbox.files.read('/tmp/a.txt', {format: 'stream', requestTimeoutMs: 1000});
    await sandbox.files.readText('/tmp/a.txt', {timeout: 1});
    await sandbox.files.write('/tmp/a.txt', upload, {timeoutMs: 1000});
    await sandbox.files.writeFiles([{path: '/tmp/a.txt', data: upload}], {requestTimeoutMs: 0});
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
    await sandbox.commands.run('long task', {executionTimeoutMs: 1000});
    await sandbox.pty.create({executionTimeoutMs: 1000});
    // @ts-expect-error Reconnecting does not set an existing process execution limit.
    await sandbox.commands.connect(123, {executionTimeoutMs: 1000});
    // @ts-expect-error Reconnecting a PTY does not set an execution limit.
    await sandbox.pty.connect(123, {executionTimeoutMs: 1000});
    const startOptions: qiniu.sandbox.CommandOptions = {executionTimeoutMs: 1000};
    // @ts-expect-error Start options with an execution limit cannot flow into connect.
    await sandbox.commands.connect(123, startOptions);
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
    const templateCreateOptions: qiniu.sandbox.TemplateCreateOptions = {
        name: 'typed-template:test',
        minDiskMb: 20480,
        minFreeDiskMb: 0
    };
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
    await template.build({ client, ...templateCreateOptions });
    const templateSteps: qiniu.sandbox.TemplateBuildStep[] = template.buildConfig.steps;
    const templateStepCount: number = templateSteps.length;
    await client.createTemplate(templateCreateOptions);
    await sandbox.updateNetwork({ allowOut: [qiniu.sandbox.ALL_TRAFFIC] });
    const injections: qiniu.sandbox.SandboxInjection[] = (await sandbox.getInjections()).injections;
    await sandbox.updateInjections(injections);
    await sandbox.updateGithubToken('github-token');
    const templateInfo: qiniu.sandbox.TemplateWithBuilds = await client.getTemplate('typed-template');
    const sandboxResources: qiniu.sandbox.SandboxResourcesResponse = await client.getSandboxResources('sandbox_1');
    const resourceInfo: qiniu.sandbox.SandboxResourceInfo | undefined = sandboxResources.resources[0];
    await client.updateGitRepositoryResourceToken('sandbox_1', 'res_1', 'token');
    const templateNames: string[] = templateInfo.names;
    const isOwner: boolean = templateInfo.isOwner;
    const defaultTemplates = await client.listDefaultTemplates();
    type DefaultTemplate = typeof defaultTemplates[number];
    const defaultTemplateIsTyped: AssertFalse<IsAny<DefaultTemplate>> = false;
    const defaultTemplateBuildStatusIsTyped: AssertFalse<IsAny<DefaultTemplate['buildStatus']>> = false;
    const defaultTemplate: qiniu.sandbox.DefaultTemplateInfo | undefined = defaultTemplates[0];
    const defaultTemplateBuildStatus: qiniu.sandbox.TemplateBuildStatus | undefined =
        defaultTemplate && defaultTemplate.buildStatus;
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
    if (defaultTemplate) {
        defaultTemplate.templateID.length;
    }
    if (defaultTemplateBuildStatus) {
        defaultTemplateBuildStatus.length;
    }
    if (resourceInfo && resourceInfo.type === 'github_repository') {
        resourceInfo.resource_id.length;
    }
    defaultTemplateIsTyped.valueOf();
    defaultTemplateBuildStatusIsTyped.valueOf();
}

void useSandboxTypes;

async function useDesktopTypes () {
    const client = new qiniu.SandboxClient({ apiKey: 'key' });
    const desktop = await client.createDesktop({
        resolution: { width: 1280, height: 720 },
        dpi: 96,
        display: ':0',
        pollOptions: { timeoutMs: 60000 }
    });
    const wrapped: qiniu.sandbox.Desktop = new qiniu.Desktop(desktop.sandbox);
    await wrapped.start();
    const size: qiniu.sandbox.ScreenSize = await desktop.screenSize();
    const point: qiniu.sandbox.Point = await desktop.cursorPosition();
    const png: Buffer = await desktop.screenshot();
    await desktop.click('left', point);
    await desktop.doubleClick(point);
    await desktop.moveMouse({ x: 0, y: 0 });
    await desktop.drag(point, { x: size.width - 1, y: size.height - 1 });
    await desktop.mouseDown('middle');
    await desktop.mouseUp('middle');
    await desktop.scroll('down', 2);
    await desktop.typeText('你好', { chunkSize: 25, delayMs: 75 });
    await desktop.press('ctrl', 'a');
    await desktop.open('https://example.com');
    await desktop.launch('xfce4-terminal');
    const ids: string[] = await desktop.applicationWindows('xfce4-terminal');
    const id: string = await desktop.activeWindowID();
    const title: string = await desktop.windowTitle(id);
    await desktop.wait(10);
    await desktop.stream.start({ vncPort: 5901, webPort: 6081, requireAuth: true, windowID: ids[0] });
    const key: string = desktop.stream.authKey();
    const url: string = desktop.stream.url({ authKey: key, viewOnly: true, resize: 'scale', autoConnect: true });
    await desktop.stream.stop();
    await desktop.sandbox.kill();
    await qiniu.Desktop.create('desktop', { client });
    const failure = new qiniu.DesktopCommandError('screenshot', { exitCode: 1, stdout: '', stderr: 'failed' });
    const result: qiniu.sandbox.CommandResult = failure.result;
    // @ts-expect-error Unknown mouse buttons must be rejected by the public type.
    desktop.click('invalid');
    // @ts-expect-error Screenshots have a concrete Buffer result.
    const invalid: string = png;
    // @ts-expect-error Only documented resize modes are accepted.
    desktop.stream.url({ resize: 'invalid' });
    return { size, png, title, url, result, invalid };
}
void useDesktopTypes;
