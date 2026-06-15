const {
    shellQuote,
    createSandboxAndWait,
    cleanupSandbox,
    runExample
} = require('./sandbox_common');

runExample(() => {
    let sandbox;
    const workdir = '/tmp/qiniu-nodejs-sdk-envd';
    const filePath = `${workdir}/hello.txt`;

    return createSandboxAndWait({
        metadata: {
            example: 'sandbox_envd'
        }
    }).then(created => {
        sandbox = created;
        console.log('Public host for port 8080:', sandbox.getHost(8080));
        return sandbox.commands.run(`mkdir -p ${shellQuote(workdir)}`);
    }).then(result => {
        console.log('mkdir exit:', result.exitCode);
        return sandbox.files.write(filePath, 'Hello from Qiniu Node.js SDK\n');
    }).then(entry => {
        console.log('Wrote:', entry.path || entry);
        return sandbox.files.readText(filePath);
    }).then(text => {
        console.log('ReadText:', JSON.stringify(text));
        return sandbox.files.writeFiles([
            { path: `${workdir}/batch-a.txt`, data: 'file A content\n' },
            { path: `${workdir}/batch-b.txt`, data: 'file B content\n' }
        ]);
    }).then(entries => {
        console.log('WriteFiles:', entries.map(item => item.path));
        return sandbox.files.read(`${workdir}/batch-a.txt`, { format: 'bytes' });
    }).then(bytes => {
        console.log('Read bytes:', bytes.length);
        return sandbox.files.list(workdir);
    }).then(entries => {
        console.log('List:', entries.map(item => `${item.type}:${item.name}`));
        return sandbox.files.exists(filePath);
    }).then(exists => {
        console.log('Exists:', exists);
        return sandbox.files.getInfo(filePath);
    }).then(info => {
        console.log('GetInfo:', info.name, info.size);
        return sandbox.files.rename(`${workdir}/batch-b.txt`, `${workdir}/batch-b-renamed.txt`);
    }).then(info => {
        console.log('Renamed to:', info.path);
        return sandbox.files.remove(`${workdir}/batch-b-renamed.txt`);
    }).then(() => {
        console.log('Removed renamed file');
        return sandbox.commands.run('echo $MY_VAR && pwd', {
            cwd: workdir,
            envs: {
                MY_VAR: 'sandbox-value'
            }
        });
    }).then(result => {
        console.log('Command exit:', result.exitCode);
        console.log('stdout:\n' + result.stdout);
        return cleanupSandbox(sandbox);
    }, err => {
        return cleanupSandbox(sandbox).then(() => {
            throw err;
        });
    });
});
