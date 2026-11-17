const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { PassThrough, Readable } = require('stream');
const destroy = require('destroy');
const { SandboxError, TimeoutError } = require('./errors');
const { millisecondsFromOptions, parseRequestUrl } = require('./util');

function validateRequestTimeout (timeoutMs) {
    if (timeoutMs > 2147483647) {
        throw new RangeError('File request timeout must not exceed 2147483647 milliseconds');
    }
}

function requestTimeout (opts) {
    const timeout = opts.requestTimeoutMs !== undefined
        ? opts.requestTimeoutMs
        : millisecondsFromOptions(opts, 'timeout');
    validateRequestTimeout(timeout);
    return timeout;
}

function isReadable (value) {
    return value && typeof value.pipe === 'function' && typeof value.read === 'function';
}

function readableEnded (source) {
    // endEmitted covers Node 6/8 and close emitted by an earlier end listener.
    return source.readableEnded || !!(source._readableState && source._readableState.endEmitted);
}

function makeDestroyable (source) {
    // SDK memory streams need error-before-close and idempotent destruction.
    // Node 8's default _destroy ends without close; Node 10/12 can emit a late
    // error when an already destroyed Readable is destroyed again with an error.
    const nativeDestroy = source.destroy;
    if (typeof nativeDestroy === 'function' && source._readableState.emitClose !== undefined) {
        source.destroy = function (err) {
            if (!source.destroyed) {
                source.pause();
                nativeDestroy.call(source, err);
            }
            return source;
        };
        return source;
    }
    source.destroy = function (err) {
        if (source.destroyed) return source;
        source.destroyed = true;
        source.readable = false;
        source.pause();
        source.unpipe();
        process.nextTick(() => {
            if (err) source.emit('error', err);
            source.emit('close');
        });
        return source;
    };
    return source;
}

function destroyStream (source) {
    if (!source) return;
    if (typeof source.destroy !== 'function' && typeof source.close === 'function') {
        source.close();
    } else {
        if (typeof source.destroy !== 'function') makeDestroyable(source);
        destroy(source);
    }
}

// Pull one part at a time so queued files and a slow receiver apply backpressure.
function sequenceStream (parts) {
    let index = 0;
    let current;
    let reading = false;
    let stopped = false;
    let demand = false;
    const output = makeDestroyable(new Readable({
        read: function () {
            demand = true;
            readNext();
        }
    }));

    function detach () {
        if (!current) return;
        current.removeListener('readable', readNext);
        current.removeListener('end', nextPart);
        current = null;
    }

    function fail (err) {
        output.destroy(err);
    }

    function nextPart () {
        detach();
        index++;
        readNext();
    }

    function readNext () {
        if (reading || stopped || !demand) return;
        reading = true;
        try {
            while (index < parts.length) {
                const part = parts[index];
                if (!isReadable(part)) {
                    index++;
                    if (!output.push(part)) {
                        demand = false;
                        break;
                    }
                } else {
                    if (!current) {
                        current = part;
                        current.on('readable', readNext);
                        current.once('end', nextPart);
                    }
                    const chunk = current.read();
                    if (chunk === null) break;
                    if (!output.push(chunk)) {
                        demand = false;
                        break;
                    }
                }
            }
            if (index === parts.length) {
                stopped = true;
                output.push(null);
            }
        } catch (err) {
            fail(err);
        }
        reading = false;
    }

    output.on('close', () => {
        stopped = true;
        detach();
        parts.forEach(part => {
            if (isReadable(part)) {
                destroyStream(part);
            }
        });
    });
    parts.forEach(part => {
        if (isReadable(part)) {
            let partEnded = false;
            const onEnd = () => { partEnded = true; };
            part.once('end', onEnd);
            part.on('error', fail);
            part.once('close', () => {
                if (!partEnded && !readableEnded(part) && !stopped && !output.destroyed) {
                    fail(new Error('Sandbox file upload source closed before completion'));
                }
                part.removeListener('end', onEnd);
                part.removeListener('error', fail);
            });
        }
    });
    return output;
}

// File transfers keep their deadline until the response body has been consumed.
function requestFile (requestUrl, options) {
    return new Promise((resolve, reject) => {
        validateRequestTimeout(options.timeout);
        const target = parseRequestUrl(requestUrl);
        const transport = target.protocol === 'https:' ? https : http;
        let response;
        let decoded;
        let output;
        let timer;
        let connectionTimer;
        let settled = false;
        let failed = false;
        let ended = false;
        let requestFinished = false;
        let pendingResult;
        let uploadStream = options.stream;
        const req = transport.request({
            method: options.method,
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port,
            path: target.path,
            headers: options.headers,
            agent: options.agent
        });

        function cleanup () {
            clearTimeout(timer);
            clearTimeout(connectionTimer);
        }

        function completeResponse () {
            if (!pendingResult || !requestFinished || failed) return;
            ended = true;
            settled = true;
            cleanup();
            destroyStream(options.stream);
            resolve(pendingResult);
        }

        function abort () {
            req.destroy();
            destroyStream(response);
            if (decoded !== response) destroyStream(decoded);
            destroyStream(options.stream);
            if (uploadStream !== options.stream) destroyStream(uploadStream);
        }

        function fail (err) {
            if (failed || ended) return;
            failed = true;
            cleanup();
            if (response && !err.resp) err.resp = response;
            if (!settled) {
                settled = true;
                reject(err);
            } else if (output) {
                output.destroy(err);
            }
            abort();
        }

        req.on('error', fail);
        req.on('finish', () => {
            requestFinished = true;
            completeResponse();
        });
        req.on('close', () => {
            if (!requestFinished && !failed) fail(new Error('Sandbox file request closed before upload completion'));
        });
        req.on('response', res => {
            response = res;
            let responseEnded = false;
            res.on('error', fail);
            res.on('aborted', () => fail(new Error('Sandbox file response aborted')));
            res.on('end', () => { responseEnded = true; });
            res.on('close', () => {
                if (!responseEnded) fail(new Error('Sandbox file response closed before completion'));
            });

            const encoding = res.headers['content-encoding'];
            decoded = encoding === 'gzip' || encoding === 'deflate' ? zlib.createUnzip() : res;
            if (decoded !== res) {
                decoded.on('error', fail);
                res.pipe(decoded);
            }
            const successful = Math.floor(res.statusCode / 100) === 2;
            if (options.streamResponse && successful) {
                output = makeDestroyable(new PassThrough());
                output.on('error', fail);
                output.on('end', () => {
                    ended = true;
                    cleanup();
                });
                output.on('close', () => {
                    cleanup();
                    if (!ended) {
                        failed = true;
                        abort();
                    }
                });
                settled = true;
                resolve({ data: output, resp: res });
                decoded.pipe(output);
                return;
            }

            const chunks = [];
            decoded.on('data', chunk => chunks.push(chunk));
            decoded.on('end', () => {
                if (failed) return;
                const body = Buffer.concat(chunks);
                let data = body;
                if (options.dataType === 'json') {
                    try {
                        data = body.length ? JSON.parse(body.toString()) : null;
                    } catch (err) {
                        if (successful) {
                            fail(err);
                            return;
                        }
                    }
                }
                if (!successful) {
                    fail(new SandboxError(`Sandbox envd request failed with status ${res.statusCode}`, res, data));
                    return;
                }
                pendingResult = { data, resp: res };
                completeResponse();
            });
        });

        const timeout = options.timeout;
        if (timeout === undefined) {
            connectionTimer = setTimeout(() => fail(new TimeoutError('Sandbox file connection timed out')), 5000);
            req.once('socket', socket => {
                if (socket.connecting) socket.once('connect', () => clearTimeout(connectionTimer));
                else clearTimeout(connectionTimer);
            });
            req.setTimeout(5000, () => fail(new TimeoutError('Sandbox file request timed out')));
        } else if (timeout > 0) {
            timer = setTimeout(() => fail(new TimeoutError('Sandbox file request timed out')), timeout);
        }
        if (options.stream) {
            let uploadEnded = false;
            const onEnd = () => { uploadEnded = true; };
            options.stream.once('end', onEnd);
            options.stream.on('error', fail);
            options.stream.once('close', () => {
                if (!uploadEnded && !readableEnded(options.stream) && !failed && !ended) {
                    fail(new Error('Sandbox file upload source closed before completion'));
                }
                options.stream.removeListener('end', onEnd);
                options.stream.removeListener('error', fail);
            });
            if (options.gzipUpload) {
                uploadStream = zlib.createGzip();
                uploadStream.on('error', fail);
                options.stream.pipe(uploadStream);
            }
            uploadStream.pipe(req);
        } else {
            req.end(options.content);
        }
    });
}

exports.requestFile = requestFile;
exports.requestTimeout = requestTimeout;
exports.isReadable = isReadable;
exports.sequenceStream = sequenceStream;
