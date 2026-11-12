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
    let snapshotID;
    const captureKey = `nodejs-sdk-snapshot-${Date.now()}`;

    function cleanup () {
        return cleanupSandbox(sandbox).then(() => {
            return snapshotID ? client.deleteSnapshot(snapshotID) : null;
        });
    }

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
            name: `nodejs-sdk-example-${Date.now()}:v1`,
            memory: false,
            // Persist this key and reuse the same body if the outcome is unknown.
            idempotencyKey: captureKey
        }).then(snapshot => {
            snapshotID = snapshot.snapshotID;
            console.log('Snapshot created:', snapshotID, snapshot.names);
            return client.listTemplateTags(snapshotID);
        }).then(tags => {
            console.log('Snapshot template tags:', tags);
        });
    }).then(() => {
        return sandbox.listSnapshots({
            limit: 5
        }).nextItems().then(snapshots => {
            console.log('Snapshots:', snapshots.map(item => item.snapshotId || item.snapshotID || item.id));
        });
    }).then(() => {
        console.log('MCP URL:', sandbox.getMcpUrl());
        return sandbox.getMcpToken().then(token => {
            console.log('MCP token:', token ? '<present>' : '<empty>');
        }, err => {
            console.log('MCP token skipped:', err.message);
        });
    }).then(() => {
        return cleanup();
    }, err => {
        return cleanup().then(() => {
            throw err;
        });
    });
});
