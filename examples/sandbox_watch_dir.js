const {
    createSandboxAndWait,
    cleanupSandbox,
    runExample
} = require('./sandbox_common');

runExample(() => {
    let sandbox;
    let handle;
    const watchedDir = '/tmp/qiniu-watch-dir';
    const watchedFile = `${watchedDir}/hello.txt`;

    function waitForEvent () {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Timed out waiting for filesystem event'));
            }, 10000);

            sandbox.files.watchDir(watchedDir, event => {
                console.log('Watch event:', event.type, event.name);
                if (event.name === 'hello.txt') {
                    clearTimeout(timer);
                    resolve(event);
                }
            }, {
                recursive: true,
                requestTimeoutMs: 10000,
                onExit: err => {
                    if (err) {
                        console.log('Watch exited:', err.message);
                    }
                }
            }).then(created => {
                handle = created;
                return sandbox.files.write(watchedFile, 'hello watch\n');
            }).catch(err => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    return createSandboxAndWait({
        metadata: {
            example: 'sandbox_watch_dir'
        }
    }).then(created => {
        sandbox = created;
        return sandbox.files.makeDir(watchedDir);
    }).then(() => {
        return waitForEvent();
    }).then(event => {
        console.log('Received event:', event.type);
        return handle ? handle.stop() : null;
    }).then(() => {
        return cleanupSandbox(sandbox);
    }, err => {
        if (handle) {
            return handle.stop().then(() => {
                console.log('WatchDir skipped:', err.message);
                return cleanupSandbox(sandbox);
            });
        }
        console.log('WatchDir skipped:', err.message);
        return cleanupSandbox(sandbox);
    });
});
