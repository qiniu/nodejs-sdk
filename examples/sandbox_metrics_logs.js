const {
    createSandboxAndWait,
    cleanupSandbox,
    runExample
} = require('./sandbox_common');

function wait (ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

runExample(() => {
    let sandbox;

    return createSandboxAndWait({
        metadata: {
            example: 'sandbox_metrics_logs'
        }
    }).then(created => {
        sandbox = created;
        return sandbox.commands.run('echo "hello metrics and logs"');
    }).then(result => {
        console.log('Command exit:', result.exitCode);
        return wait(5000);
    }).then(() => {
        return sandbox.getMetrics();
    }).then(metrics => {
        console.log('Metrics:', metrics);
        return sandbox.getLogs();
    }).then(logs => {
        console.log('Logs:', logs);
        return cleanupSandbox(sandbox);
    }, err => {
        return cleanupSandbox(sandbox).then(() => {
            throw err;
        });
    });
});
