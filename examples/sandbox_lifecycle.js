const {
    qiniu,
    sandboxClient,
    sandboxTemplate,
    cleanupSandbox,
    runExample
} = require('./sandbox_common');

runExample(() => {
    const client = sandboxClient();
    let sandbox;

    return client.listTemplates({ limit: 5 }).then(templates => {
        console.log('Templates:', Array.isArray(templates) ? templates.length : templates);
        return qiniu.sandbox.Sandbox.create({
            client,
            template: sandboxTemplate(),
            timeout: 300,
            metadata: {
                example: 'sandbox_lifecycle'
            },
            network: {
                allowOut: [qiniu.sandbox.ALL_TRAFFIC]
            }
        });
    }).then(created => {
        sandbox = created;
        return sandbox.waitForReady({
            interval: 3000,
            timeout: 180000
        });
    }).then(info => {
        console.log('Sandbox ready:', sandbox.sandboxId, info.state || '');
        console.log('Host for port 8080:', sandbox.getHost(8080));
        return sandbox.isRunning();
    }).then(running => {
        console.log('Is running:', running);
        return sandbox.setTimeout({ timeout: 300 });
    }).then(() => {
        console.log('Timeout updated');
        return sandbox.refresh({ duration: 300 });
    }).then(() => {
        console.log('Sandbox refreshed');
        return sandbox.updateNetwork({
            allowOut: [qiniu.sandbox.ALL_TRAFFIC]
        }).then(info => {
            console.log('Network updated:', info.network || info);
        }, err => {
            console.log('Network update skipped:', err.message);
        });
    }).then(() => {
        return cleanupSandbox(sandbox);
    }, err => {
        return cleanupSandbox(sandbox).then(() => {
            throw err;
        });
    });
});
