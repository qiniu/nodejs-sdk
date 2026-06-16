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

    return qiniu.sandbox.Sandbox.create(sandboxTemplate(), {
        client,
        timeout: 300,
        metadata: {
            example: 'sandbox_create'
        }
    }).then(created => {
        sandbox = created;
        console.log('Sandbox created:', sandbox.sandboxId);
        console.log('Template:', sandbox.info.templateID || sandbox.info.template_id || sandboxTemplate());
        return cleanupSandbox(sandbox);
    });
});
