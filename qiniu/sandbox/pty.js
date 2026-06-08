function Pty (sandbox) {
    this.sandbox = sandbox;
    this.commands = sandbox.commands;
}

Pty.prototype.create = function (opts) {
    opts = opts || {};
    return this.commands.start(opts.cmd || '/bin/bash', Object.assign({}, opts, {
        stdin: true
    }));
};

exports.Pty = Pty;
