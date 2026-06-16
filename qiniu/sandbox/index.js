const { ResponseWrapper } = require('../httpc/responseWrapper');
const constants = require('./constants');
const errors = require('./errors');
const network = require('./network');

module.exports = {
    DEFAULT_ENDPOINT: constants.DEFAULT_ENDPOINT,
    DEFAULT_TEMPLATE: constants.DEFAULT_TEMPLATE,
    DEFAULT_SANDBOX_TIMEOUT_MS: constants.DEFAULT_SANDBOX_TIMEOUT_MS,
    DEFAULT_USER: constants.DEFAULT_USER,
    ALL_TRAFFIC: network.ALL_TRAFFIC,
    SandboxClient: require('./client').SandboxClient,
    Sandbox: require('./sandbox').Sandbox,
    SandboxPaginator: require('./sandbox').SandboxPaginator,
    SnapshotPaginator: require('./sandbox').SnapshotPaginator,
    Filesystem: require('./filesystem').Filesystem,
    FileType: require('./filesystem').FileType,
    FilesystemEventType: require('./filesystem').FilesystemEventType,
    WatchHandle: require('./filesystem').WatchHandle,
    Commands: require('./commands').Commands,
    CommandHandle: require('./commands').CommandHandle,
    Git: require('./git').Git,
    Pty: require('./pty').Pty,
    Template: require('./template').Template,
    Volume: require('./volume').Volume,
    SandboxError: errors.SandboxError,
    CommandExitError: errors.CommandExitError,
    TimeoutError: errors.TimeoutError,
    NotImplementedError: errors.NotImplementedError,
    InvalidArgumentError: errors.InvalidArgumentError,
    NotFoundError: errors.NotFoundError,
    FileNotFoundError: errors.FileNotFoundError,
    SandboxNotFoundError: errors.SandboxNotFoundError,
    GitAuthError: errors.GitAuthError,
    GitUpstreamError: errors.GitUpstreamError,
    TemplateBuildError: errors.TemplateBuildError,
    ResponseWrapper
};
