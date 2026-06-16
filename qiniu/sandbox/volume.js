const { NotImplementedError } = require('./errors');

function Volume () {}

Volume.prototype.create = function () {
    return Promise.reject(new NotImplementedError('Volume is not supported by Qiniu Sandbox OpenAPI'));
};

Volume.prototype.delete = function () {
    return Promise.reject(new NotImplementedError('Volume is not supported by Qiniu Sandbox OpenAPI'));
};

Volume.prototype.list = function () {
    return Promise.reject(new NotImplementedError('Volume is not supported by Qiniu Sandbox OpenAPI'));
};

exports.Volume = Volume;
