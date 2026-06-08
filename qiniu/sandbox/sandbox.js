const { Commands } = require('./commands');
const { DEFAULT_USER, ENVD_PORT } = require('./constants');
const { Filesystem } = require('./filesystem');
const { Git } = require('./git');
const { Pty } = require('./pty');
const { SandboxClient } = require('./client');
const { appendQuery, fileSignature, poll, rawRequest } = require('./util');

function getSandboxID (data) {
    return data && (data.sandboxID || data.sandboxId || data.sandbox_id || data.id);
}

function getInfoValue (info, camelKey, snakeKey) {
    return info && (info[camelKey] !== undefined ? info[camelKey] : info[snakeKey]);
}

function Sandbox (opts) {
    opts = opts || {};
    this.client = opts.client || new SandboxClient(opts);
    this.info = opts.info || {};
    this.sandboxId = opts.sandboxId || opts.sandboxID || getSandboxID(this.info);
    this.sandboxID = this.sandboxId;
    this.sandboxDomain = this.info.domain || this.info.sandboxDomain || this.info.sandbox_domain;
    this.domain = this.sandboxDomain;
    this.envdVersion = getInfoValue(this.info, 'envdVersion', 'envd_version');
    this.envdAccessToken = opts.envdAccessToken || getInfoValue(this.info, 'envdAccessToken', 'envd_access_token');
    this.trafficAccessToken = getInfoValue(this.info, 'trafficAccessToken', 'traffic_access_token');
    this._envdUrl = opts.envdUrl;
    this.files = new Filesystem(this);
    this.filesystem = this.files;
    this.commands = new Commands(this);
    this.pty = new Pty(this);
    this.git = new Git(this.commands);
}

Sandbox.create = function (templateOrOpts, maybeOpts) {
    const opts = typeof templateOrOpts === 'string'
        ? Object.assign({}, maybeOpts || {}, { templateID: templateOrOpts })
        : (templateOrOpts || {});
    const client = opts.client || new SandboxClient(opts);
    return client.createSandbox(opts).then(info => {
        const sandbox = new Sandbox({ client, info });
        return sandbox.refreshEnvdTokenIfNeeded();
    });
};

Sandbox.connect = function (sandboxID, opts) {
    opts = opts || {};
    const client = opts.client || new SandboxClient(opts);
    return client.connectSandbox(sandboxID, opts).then(info => {
        const sandbox = new Sandbox({
            client,
            sandboxId: sandboxID,
            info
        });
        return sandbox.refreshEnvdTokenIfNeeded();
    });
};

Sandbox.list = function (opts) {
    const client = opts && opts.client ? opts.client : new SandboxClient(opts);
    const params = Object.assign({}, opts || {});
    delete params.client;
    return client.listSandboxesV2(params).then(items => {
        if (!Array.isArray(items)) {
            return items;
        }
        return items.map(info => new Sandbox({ client, info }));
    });
};

Sandbox.prototype.kill = function () {
    return this.client.deleteSandbox(this.sandboxId);
};

Sandbox.prototype.setTimeout = function (timeoutOrOpts) {
    return this.client.updateSandboxTimeout(this.sandboxId, timeoutOrOpts);
};

Sandbox.prototype.refresh = function (opts) {
    return this.client.refreshSandbox(this.sandboxId, opts);
};

Sandbox.prototype.updateNetwork = function (network) {
    return this.client.updateSandbox(this.sandboxId, { network });
};

Sandbox.prototype.pause = function () {
    return this.client.pauseSandbox(this.sandboxId);
};

Sandbox.prototype.getInfo = function () {
    return this.client.getSandbox(this.sandboxId);
};

Sandbox.prototype.refreshEnvdTokenIfNeeded = function () {
    if (this.envdAccessToken) {
        return Promise.resolve(this);
    }
    return this.getInfo().then(info => {
        this.updateInfo(info);
        return this;
    });
};

Sandbox.prototype.updateInfo = function (info) {
    if (info) {
        this.info = info;
        this.envdAccessToken = getInfoValue(info, 'envdAccessToken', 'envd_access_token') || this.envdAccessToken;
        this.envdVersion = getInfoValue(info, 'envdVersion', 'envd_version') || this.envdVersion;
        this.domain = info.domain || info.sandboxDomain || info.sandbox_domain || this.domain;
        this.sandboxDomain = this.domain;
    }
    return this;
};

Sandbox.prototype.getMetrics = function (opts) {
    return this.client.getSandboxMetrics(this.sandboxId, opts);
};

Sandbox.prototype.getLogs = function (opts) {
    return this.client.getSandboxLogs(this.sandboxId, opts);
};

Sandbox.prototype.waitForReady = function (opts) {
    return poll(() => this.getInfo(), opts, info => info && info.state === 'running')
        .then(info => {
            this.updateInfo(info);
            return info;
        });
};

Sandbox.prototype.isRunning = function () {
    return rawRequest(this.envdUrl() + '/health', {
        method: 'GET',
        dataType: 'text'
    }).then(() => true, err => {
        if (err.response && err.response.statusCode === 502) {
            return false;
        }
        if (err.resp && err.resp.statusCode === 502) {
            return false;
        }
        throw err;
    });
};

Sandbox.prototype.getHost = function (port) {
    if (!this.domain) {
        return '';
    }
    return `${port}-${this.sandboxId}.${this.domain}`;
};

Sandbox.prototype.envdUrl = function () {
    return this._envdUrl || `https://${this.getHost(ENVD_PORT)}`;
};

Sandbox.prototype.fileUrl = function (path, operation, opts) {
    opts = opts || {};
    const user = opts.user || DEFAULT_USER;
    const query = {
        path,
        username: user
    };
    if (this.envdAccessToken) {
        const expiration = opts.signatureExpiration || opts.signature_expiration || 300;
        query.signature = fileSignature(path, operation, user, this.envdAccessToken, expiration);
        query.signature_expiration = expiration;
    }
    return this.envdUrl() + appendQuery('/files', query);
};

Sandbox.prototype.downloadUrl = function (path, opts) {
    return this.fileUrl(path, 'read', opts);
};

Sandbox.prototype.DownloadURL = Sandbox.prototype.downloadUrl;

Sandbox.prototype.uploadUrl = function (path, opts) {
    return this.fileUrl(path, 'write', opts);
};

Sandbox.prototype.UploadURL = Sandbox.prototype.uploadUrl;

Sandbox.prototype.batchUploadUrl = function (user) {
    return this.envdUrl() + appendQuery('/files', {
        username: user || DEFAULT_USER
    });
};

exports.Sandbox = Sandbox;
