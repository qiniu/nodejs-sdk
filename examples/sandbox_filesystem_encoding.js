const {
    createSandboxAndWait,
    cleanupSandbox,
    runExample
} = require('./sandbox_common');

runExample(() => {
    let sandbox;
    const filePath = '/tmp/qiniu-nodejs-sdk-encoding.txt';

    return createSandboxAndWait({
        metadata: {
            example: 'sandbox_filesystem_encoding'
        }
    }).then(created => {
        sandbox = created;
        return sandbox.files.write(filePath, 'hello with octet-stream and gzip\n', {
            useOctetStream: true,
            gzip: true
        });
    }).then(entry => {
        console.log('Wrote:', entry.path || entry);
        return sandbox.files.read(filePath, {
            gzip: true
        });
    }).then(text => {
        console.log('Read:', JSON.stringify(text));
        return cleanupSandbox(sandbox);
    }, err => {
        return cleanupSandbox(sandbox).then(() => {
            throw err;
        });
    });
});
