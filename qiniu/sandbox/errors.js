function defineError (name) {
    function TypedSandboxError (message, props) {
        Error.call(this);
        this.name = name;
        this.message = message || name;
        if (props) {
            Object.assign(this, props);
        }
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, TypedSandboxError);
        }
    }

    TypedSandboxError.prototype = Object.create(Error.prototype);
    TypedSandboxError.prototype.constructor = TypedSandboxError;
    return TypedSandboxError;
}

function SandboxError (message, response, data) {
    Error.call(this);
    this.name = 'SandboxError';
    this.message = message;
    this.response = response;
    this.data = data;
    if (Error.captureStackTrace) {
        Error.captureStackTrace(this, SandboxError);
    }
}

SandboxError.prototype = Object.create(Error.prototype);
SandboxError.prototype.constructor = SandboxError;

function CommandExitError (result) {
    result = result || {};
    SandboxError.call(this, `Command exited with code ${result.exitCode}`, null, result);
    this.name = 'CommandExitError';
    Object.assign(this, result);
}

CommandExitError.prototype = Object.create(SandboxError.prototype);
CommandExitError.prototype.constructor = CommandExitError;

exports.SandboxError = SandboxError;
exports.CommandExitError = CommandExitError;
exports.TimeoutError = defineError('TimeoutError');
exports.NotImplementedError = defineError('NotImplementedError');
exports.GitAuthError = defineError('GitAuthError');
exports.GitUpstreamError = defineError('GitUpstreamError');
exports.TemplateBuildError = defineError('TemplateBuildError');
