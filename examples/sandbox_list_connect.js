const {
    qiniu,
    sandboxClient,
    sandboxTemplate,
    cleanupSandbox,
    runExample
} = require('./sandbox_common');

runExample(() => {
    const client = sandboxClient();
    const template = sandboxTemplate();
    let sandbox;

    return qiniu.sandbox.Sandbox.create({
        client,
        template,
        timeout: 300,
        metadata: {
            example: 'sandbox_list_connect'
        }
    }).then(created => {
        sandbox = created;
        console.log('Created:', sandbox.sandboxId);
        return qiniu.sandbox.Sandbox.list({
            client,
            limit: 10,
            query: {
                template: [template]
            }
        });
    }).then(items => {
        console.log('List result:', Array.isArray(items) ? items.map(item => item.sandboxId || item.sandboxID) : items);
        return qiniu.sandbox.Sandbox.connect(sandbox.sandboxId, {
            client,
            timeout: 300
        });
    }).then(connected => {
        console.log('Connected:', connected.sandboxId);
        return cleanupSandbox(sandbox);
    }, err => {
        return cleanupSandbox(sandbox).then(() => {
            throw err;
        });
    });
});
