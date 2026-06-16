const should = require('should');
const http = require('http');
const fs = require('fs');
const stream = require('stream');
const zlib = require('zlib');

const qiniu = require('../index');

function startServer (handler) {
    const requests = [];
    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on('data', chunk => {
            chunks.push(chunk);
        });
        req.on('end', () => {
            const rawBody = Buffer.concat(chunks);
            const record = {
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: rawBody.toString(),
                rawBody
            };
            requests.push(record);
            handler(record, res);
        });
    });

    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
            resolve({
                server,
                requests,
                endpoint: `http://127.0.0.1:${server.address().port}`
            });
        });
    });
}

function closeServer (server) {
    return new Promise(resolve => server.close(resolve));
}

function parseUrl (value) {
    return new URL(value, 'http://127.0.0.1');
}

function decodeConnectEnvelope (body) {
    body[0].should.eql(0);
    const length = body.readUInt32BE(1);
    return JSON.parse(body.slice(5, 5 + length).toString());
}

function encodeConnectEnvelope (message) {
    const payload = Buffer.from(JSON.stringify(message));
    const header = Buffer.alloc(5);
    header[0] = 0;
    header.writeUInt32BE(payload.length, 1);
    return Buffer.concat([header, payload]);
}

function encodeRawConnectEnvelope (payload, flags) {
    payload = Buffer.from(payload);
    const header = Buffer.alloc(5);
    header[0] = flags || 0;
    header.writeUInt32BE(payload.length, 1);
    return Buffer.concat([header, payload]);
}

function encodeConnectEndEnvelope (message) {
    return encodeRawConnectEnvelope(JSON.stringify(message || {}), 2);
}

function encodeOversizedConnectHeader () {
    const header = Buffer.alloc(5);
    header[0] = 0;
    header.writeUInt32BE(10 * 1024 * 1024 + 1, 1);
    return header;
}

function encodeTruncatedConnectHeader () {
    const header = Buffer.alloc(5);
    header[0] = 0;
    header.writeUInt32BE(20, 1);
    return header;
}

function handleGitAndPty (git, pty, commandsSeen, fixture) {
    return git.clone('https://example.com/repo.git', { path: '/repo' })
        .then(() => git.init('/repo'))
        .then(() => git.add('/repo', { all: true }))
        .then(() => git.commit('/repo', 'msg', { allowEmpty: true }))
        .then(() => git.pull('/repo', { remote: 'origin', branch: 'main' }))
        .then(() => git.push('/repo', { remote: 'origin', branch: 'main' }))
        .then(() => git.createBranch('/repo', 'feature'))
        .then(() => git.checkoutBranch('/repo', 'main'))
        .then(() => git.deleteBranch('/repo', 'feature', { force: true }))
        .then(() => git.remoteAdd('/repo', 'origin', 'https://example.com/repo.git'))
        .then(() => git.remoteGet('/repo', 'origin'))
        .then(value => {
            value.should.eql('value');
            return git.setConfig('/repo', 'user.name', 'Alice');
        })
        .then(() => git.getConfig('/repo', 'user.name'))
        .then(value => {
            value.should.eql('value');
            return git.configureUser('/repo', 'Alice', 'alice@example.com');
        })
        .then(() => pty.create({ cmd: 'bash', cwd: '/repo' }))
        .then(handle => {
            handle.pid.should.eql(12);
            commandsSeen[0].cmd.should.eql('git clone \'https://example.com/repo.git\' \'/repo\'');
            commandsSeen[1].cmd.should.eql('git init');
            commandsSeen[1].opts.cwd.should.eql('/repo');
            commandsSeen.some(item => item.cmd.indexOf('git commit -m') === 0).should.eql(true);
            const ptyBody = decodeConnectEnvelope(fixture.requests[6].rawBody);
            ptyBody.process.cmd.should.eql('bash');
            ptyBody.process.cwd.should.eql('/repo');
            should.exist(ptyBody.pty);
        });
}

module.exports = {
    should,
    http,
    fs,
    stream,
    zlib,
    qiniu,
    startServer,
    closeServer,
    parseUrl,
    decodeConnectEnvelope,
    encodeConnectEnvelope,
    encodeRawConnectEnvelope,
    encodeConnectEndEnvelope,
    encodeOversizedConnectHeader,
    encodeTruncatedConnectHeader,
    handleGitAndPty
};
