const { SandboxClient } = require('./client');

function Template () {
    if (!(this instanceof Template)) {
        return new Template();
    }
    this.buildConfig = {
        steps: []
    };
}

Template.prototype.fromImage = function (image) {
    this.buildConfig.fromImage = image;
    return this;
};

Template.prototype.fromTemplate = function (templateID) {
    this.buildConfig.fromTemplate = templateID;
    return this;
};

Template.prototype.aptInstall = function (packages) {
    this.buildConfig.steps.push({
        type: 'apt',
        packages: Array.isArray(packages) ? packages : [packages]
    });
    return this;
};

Template.prototype.runCmd = function (cmd) {
    this.buildConfig.steps.push({
        type: 'run',
        cmd
    });
    return this;
};

Template.prototype.copy = function (src, dest) {
    this.buildConfig.steps.push({
        type: 'copy',
        src,
        dest
    });
    return this;
};

Template.prototype.setStartCmd = function (cmd) {
    this.buildConfig.startCmd = cmd;
    return this;
};

Template.prototype.setReadyCmd = function (cmd) {
    this.buildConfig.readyCmd = cmd;
    return this;
};

Template.prototype.build = function (opts) {
    opts = opts || {};
    const client = opts.client || new SandboxClient(opts);
    const body = Object.assign({}, opts, {
        buildConfig: this.buildConfig
    });
    delete body.client;
    delete body.endpoint;
    delete body.apiUrl;
    delete body.apiKey;
    delete body.accessToken;
    delete body.mac;
    return client.createTemplateV3(body);
};

exports.Template = Template;
