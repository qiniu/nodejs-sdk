const {
    qiniu,
    sandboxClient,
    createSandboxAndWait,
    cleanupSandbox,
    runExample
} = require('./sandbox_common');

runExample(() => {
    const client = sandboxClient();
    let sandbox;

    return createSandboxAndWait({
        client,
        metadata: {
            example: 'sandbox_paginator_snapshot_mcp'
        }
    }).then(created => {
        sandbox = created;

        const paginator = qiniu.sandbox.Sandbox.list({
            client,
            limit: 5,
            query: {
                metadata: {
                    example: 'sandbox_paginator_snapshot_mcp'
                },
                state: ['running']
            }
        });

        return paginator.nextItems().then(items => {
            console.log('First page:', items.map(item => item.sandboxId));
            console.log('Has next page:', paginator.hasNext);
            console.log('Next token:', paginator.nextToken || '');
        });
    }).then(() => {
        return sandbox.createSnapshot({
            name: `nodejs-sdk-example-${Date.now()}`
        }).then(snapshot => {
            console.log('Snapshot created:', snapshot.snapshotId || snapshot.snapshotID || snapshot);
        }, err => {
            console.log('Snapshot skipped:', err.message);
        });
    }).then(() => {
        return sandbox.listSnapshots({
            limit: 5
        }).nextItems().then(snapshots => {
            console.log('Snapshots:', snapshots.map(item => item.snapshotId || item.snapshotID || item.id));
        }, err => {
            console.log('List snapshots skipped:', err.message);
        });
    }).then(() => {
        console.log('MCP URL:', sandbox.getMcpUrl());
        return sandbox.getMcpToken().then(token => {
            console.log('MCP token:', token ? '<present>' : '<empty>');
        }, err => {
            console.log('MCP token skipped:', err.message);
        });
    }).then(() => {
        return cleanupSandbox(sandbox);
    }, err => {
        return cleanupSandbox(sandbox).then(() => {
            throw err;
        });
    });
});
