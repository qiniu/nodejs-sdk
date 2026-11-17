const fs = require('fs');
const { qiniu, runExample, sandboxClient } = require('./sandbox_common');

runExample(function () {
    let desktop;
    function cleanup () {
        if (!desktop) return Promise.resolve();
        return desktop.stream.stop().then(
            () => desktop.sandbox.kill(),
            err => desktop.sandbox.kill().then(() => { throw err; })
        );
    }
    return qiniu.Desktop.create({
        client: sandboxClient(),
        template: process.env.QINIU_SANDBOX_DESKTOP_TEMPLATE || 'desktop',
        timeout: 180,
        resolution: { width: 1024, height: 768 }
    }).then(value => {
        desktop = value;
        console.log('Desktop sandbox:', desktop.sandbox.sandboxId);
        return desktop.launch('xfce4-terminal');
    }).then(() => desktop.wait(1000))
        .then(() => desktop.typeText('echo Hello desktop'))
        .then(() => desktop.press('enter'))
        .then(() => desktop.screenshot())
        .then(png => {
            fs.writeFileSync('desktop.png', png);
            console.log('Screenshot saved to desktop.png');
            return desktop.stream.start();
        }).then(() => {
            console.log('noVNC URL (password omitted):', desktop.stream.url());
            console.log('Use desktop.stream.authKey() to retrieve the VNC password.');
            return desktop.wait(30000);
        }).then(cleanup, err => cleanup().catch(cleanupError => {
            err.cleanupError = cleanupError;
        }).then(() => { throw err; }));
});
