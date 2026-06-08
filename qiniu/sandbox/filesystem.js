const { connectRPC } = require('./envd');
const { rawRequest } = require('./util');
const { Readable } = require('stream');

function normalizeFileType (type) {
    if (type === 'FILE_TYPE_DIRECTORY' || type === 'DIRECTORY' || type === 'dir') {
        return 'dir';
    }
    if (type === 'FILE_TYPE_FILE' || type === 'FILE' || type === 'file') {
        return 'file';
    }
    return type || 'unknown';
}

function normalizeEntry (entry) {
    entry = entry || {};
    return Object.assign({}, entry, {
        type: normalizeFileType(entry.type)
    });
}

function multipartBody (boundary, parts) {
    const chunks = [];
    parts.forEach(part => {
        chunks.push(Buffer.from(`--${boundary}\r\n`));
        chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.field}"; filename="${part.filename}"\r\n`));
        chunks.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'));
        chunks.push(Buffer.isBuffer(part.data) ? part.data : Buffer.from(String(part.data)));
        chunks.push(Buffer.from('\r\n'));
    });
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return Buffer.concat(chunks);
}

function Filesystem (sandbox) {
    this.sandbox = sandbox;
}

function formatReadResult (data, opts) {
    opts = opts || {};
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data || ''));
    const format = opts.format || 'text';
    if (format === 'bytes') {
        return buffer;
    }
    if (format === 'stream') {
        return Readable.from([buffer]);
    }
    if (format === 'blob') {
        return typeof global.Blob !== 'undefined' ? new global.Blob([buffer]) : buffer;
    }
    return buffer.toString();
}

Filesystem.prototype.read = function (path, opts) {
    opts = opts || {};
    return rawRequest(this.sandbox.downloadUrl(path, opts), {
        method: 'GET',
        dataType: 'buffer',
        headers: {}
    }).then(({ data }) => formatReadResult(data, opts));
};

Filesystem.prototype.readText = function (path, opts) {
    return this.read(path, opts).then(data => Buffer.isBuffer(data) ? data.toString() : data);
};

Filesystem.prototype.write = function (pathOrFiles, dataOrOpts, maybeOpts) {
    if (Array.isArray(pathOrFiles)) {
        return this.writeFiles(pathOrFiles, dataOrOpts);
    }

    const path = pathOrFiles;
    const opts = maybeOpts || {};
    const boundary = `qiniu-sandbox-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const body = multipartBody(boundary, [{
        field: 'file',
        filename: path,
        data: dataOrOpts
    }]);

    return rawRequest(this.sandbox.uploadUrl(path, opts), {
        method: 'POST',
        content: body,
        dataType: 'json',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`
        }
    }).then(({ data }) => Array.isArray(data) ? normalizeEntry(data[0]) : normalizeEntry(data));
};

Filesystem.prototype.writeFiles = function (files, opts) {
    opts = opts || {};
    const boundary = `qiniu-sandbox-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const parts = files.map(file => ({
        field: 'file',
        filename: file.path,
        data: file.data
    }));

    return rawRequest(this.sandbox.batchUploadUrl(opts.user), {
        method: 'POST',
        content: multipartBody(boundary, parts),
        dataType: 'json',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`
        }
    }).then(({ data }) => (data || []).map(normalizeEntry));
};

Filesystem.prototype.getInfo = function (path, opts) {
    return connectRPC(this.sandbox, '/filesystem.Filesystem/Stat', { path }, opts)
        .then(data => normalizeEntry(data.entry));
};

Filesystem.prototype.stat = Filesystem.prototype.getInfo;

Filesystem.prototype.list = function (path, opts) {
    opts = opts || {};
    return connectRPC(this.sandbox, '/filesystem.Filesystem/ListDir', {
        path,
        depth: opts.depth || 1
    }, opts).then(data => (data.entries || []).map(normalizeEntry));
};

Filesystem.prototype.exists = function (path, opts) {
    return this.getInfo(path, opts).then(() => true, err => {
        if (err.response && err.response.statusCode === 404) {
            return false;
        }
        throw err;
    });
};

Filesystem.prototype.makeDir = function (path, opts) {
    return connectRPC(this.sandbox, '/filesystem.Filesystem/MakeDir', { path }, opts)
        .then(data => normalizeEntry(data.entry));
};

Filesystem.prototype.mkdir = Filesystem.prototype.makeDir;

Filesystem.prototype.remove = function (path, opts) {
    return connectRPC(this.sandbox, '/filesystem.Filesystem/Remove', { path }, opts)
        .then(() => null);
};

Filesystem.prototype.rename = function (oldPath, newPath, opts) {
    return connectRPC(this.sandbox, '/filesystem.Filesystem/Move', {
        source: oldPath,
        destination: newPath
    }, opts).then(data => normalizeEntry(data.entry));
};

Filesystem.prototype.move = Filesystem.prototype.rename;

exports.Filesystem = Filesystem;
exports.normalizeEntry = normalizeEntry;
