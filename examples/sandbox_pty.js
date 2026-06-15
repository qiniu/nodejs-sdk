const {
    createSandboxAndWait,
    cleanupSandbox,
    runExample
} = require('./sandbox_common');

runExample(() => {
    let sandbox;
    let handle;
    const output = [];

    return createSandboxAndWait({
        metadata: {
            example: 'sandbox_pty'
        }
    }).then(created => {
        sandbox = created;
        return sandbox.pty.create({
            cols: 80,
            rows: 24,
            onData: data => {
                output.push(Buffer.from(data).toString());
            }
        });
    }).then(createdHandle => {
        handle = createdHandle;
        console.log('PTY pid:', handle.pid);
        return sandbox.pty.sendInput(handle.pid, 'echo hello from pty\n');
    }, err => {
        console.log('PTY create skipped:', err.message);
        return null;
    }).then(() => {
        if (!handle) {
            return null;
        }
        return sandbox.pty.resize(handle.pid, {
            cols: 100,
            rows: 30
        });
    }).then(() => {
        if (!handle) {
            return null;
        }
        return sandbox.pty.sendInput(handle.pid, 'exit\n');
    }).then(() => {
        if (!handle) {
            return null;
        }
        return handle.wait();
    }).then(result => {
        if (result) {
            console.log('PTY exit:', result.exitCode);
        }
        console.log('PTY output:\n' + output.join(''));
        return cleanupSandbox(sandbox);
    }, err => {
        if (handle) {
            return handle.disconnect().then(() => {
                console.log('PTY input/update skipped:', err.message);
                console.log('PTY output:\n' + output.join(''));
                return cleanupSandbox(sandbox);
            });
        }
        return cleanupSandbox(sandbox).then(() => {
            throw err;
        });
    });
});
