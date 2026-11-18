const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { PassThrough, Readable } = require('stream');
const destroy = require('destroy');
const { SandboxError, TimeoutError } = require('./errors');
const { parseRequestUrl } = require('./util');

function validateRequestTimeout (timeoutMs) {
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 0)) {
        throw new RangeError('File request timeout must be a finite, non-negative number');
    }
    if (timeoutMs > 2147483647) {
        throw new RangeError('File request timeout must not exceed 2147483647 milliseconds');
    }
}

function requestTimeout (opts) {
    let timeout = opts.requestTimeoutMs;
    if (timeout === undefined) timeout = opts.timeoutMs;
    if (timeout === undefined && opts.timeout !== undefined) {
        timeout = Number.isFinite(opts.timeout) ? opts.timeout * 1000 : NaN;
    }
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

function readableClosed (source) {
    const state = source._readableState;
    return source.destroyed || source.closed || !!(state && (state.destroyed || state.closed));
}

function prematureCloseError (source) {
    if (!readableEnded(source) && readableClosed(source)) {
        return source.errored || new Error('Sandbox file upload source closed before completion');
    }
}

const closingSources = new WeakSet();

function cleanupClosedSource (source, cleanup) {
    const state = source._readableState;
    if (state && (state.closeEmitted || (state.closed && state.emitClose === false && (!state.errored || state.errorEmitted)))) {
        cleanup();
    } else if ((typeof source._destroy === 'function' && source._destroy === Readable.prototype._destroy) || (typeof source._destroy !== 'function' && typeof source.close !== 'function')) {
        // The native Readable destroy callback is synchronous, including Node
        // 8/10/12 without closeEmitted. Keep protection for its queued events.
        process.nextTick(cleanup);
    } else {
        cleanup();
        // Some fs streams emit only error when opening fails. Keep one guard,
        // without retaining the request, until either terminal event arrives.
        if (closingSources.has(source)) return;
        closingSources.add(source);
        const finished = () => {
            closingSources.delete(source);
            source.removeListener('error', finished);
            source.removeListener('close', finished);
        };
        source.once('error', finished);
        source.once('close', finished);
    }
}

function cleanupFinishedSource (source, cleanup) {
    const state = source._readableState;
    const writable = source._writableState;
    const autoClosing = state && state.autoDestroy && (!writable || (writable.autoDestroy && writable.finished));
    if (readableClosed(source) || autoClosing) cleanupClosedSource(source, cleanup);
    else cleanup();
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

const multipartSources = new WeakMap();

// Pull one part at a time so queued files and a slow receiver apply backpressure.
function sequenceStream (parts) {
    let index = 0;
    let current;
    let reading = false;
    let stopped = false;
    let demand = false;
    let initialError;
    const releaseSources = [];
    let reportSourceError;
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
        reportSourceError(err);
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
            if (initialError) throw initialError;
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
                    if (chunk === null) {
                        if (!readableEnded(part)) break;
                        if (current) {
                            detach();
                            index++;
                        }
                        continue;
                    }
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

    function release () {
        stopped = true;
        detach();
        releaseSources.splice(0).forEach(releaseSource => releaseSource());
    }

    // The request owns the sources until it settles, even after the multipart
    // output ends. An input can still report an asynchronous close failure.
    multipartSources.set(output, {
        setErrorHandler: handler => { reportSourceError = handler; },
        release
    });
    reportSourceError = err => output.destroy(err);
    parts.forEach(part => {
        if (isReadable(part)) {
            const sourceError = prematureCloseError(part);
            initialError = initialError || sourceError;
            let partEnded = false;
            const onEnd = () => { partEnded = true; };
            const cleanup = () => {
                part.removeListener('end', onEnd);
                part.removeListener('error', fail);
                part.removeListener('close', onClose);
            };
            const onClose = () => {
                if (!partEnded && !readableEnded(part) && !stopped && !output.destroyed) {
                    fail(new Error('Sandbox file upload source closed before completion'));
                }
                cleanup();
            };
            part.once('end', onEnd);
            part.on('error', fail);
            part.once('close', onClose);
            releaseSources.push(() => {
                if (partEnded || readableEnded(part)) {
                    cleanupFinishedSource(part, cleanup);
                } else {
                    destroyStream(part);
                    cleanupClosedSource(part, cleanup);
                }
            });
            if (readableClosed(part)) cleanupClosedSource(part, cleanup);
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
        let cleanupUploadSource;
        const parts = multipartSources.get(options.stream);
        const sourceError = options.stream && prematureCloseError(options.stream);
        const req = sourceError ? null : transport.request({
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
            finishUpload();
            resolve(pendingResult);
        }

        function finishUpload () {
            if (parts) {
                parts.release();
                multipartSources.delete(options.stream);
            }
            if (cleanupUploadSource) cleanupUploadSource();
        }

        function abort () {
            if (req) req.destroy();
            destroyStream(response);
            if (decoded !== response) destroyStream(decoded);
            if (options.stream && !readableEnded(options.stream)) destroyStream(options.stream);
            finishUpload();
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

        if (parts) parts.setErrorHandler(fail);
        if (options.stream) {
            let uploadEnded = false;
            const onEnd = () => { uploadEnded = true; };
            const cleanupSource = () => {
                options.stream.removeListener('end', onEnd);
                options.stream.removeListener('error', fail);
                options.stream.removeListener('close', onClose);
            };
            const onClose = () => {
                if (!uploadEnded && !readableEnded(options.stream) && !failed && !ended) {
                    fail(new Error('Sandbox file upload source closed before completion'));
                }
                cleanupSource();
            };
            options.stream.once('end', onEnd);
            options.stream.on('error', fail);
            options.stream.once('close', onClose);
            cleanupUploadSource = () => cleanupFinishedSource(options.stream, cleanupSource);
            if (sourceError) {
                fail(sourceError);
                return;
            }
            if (readableClosed(options.stream)) cleanupUploadSource();
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
        if (timeout !== undefined) {
            // The full-transfer deadline owns explicit timeouts (including zero).
            // Override inherited Agent idle timeouts on new and reused sockets.
            req.once('socket', socket => socket.setTimeout(0));
        }
        if (timeout === undefined) {
            connectionTimer = setTimeout(() => fail(new TimeoutError('Sandbox file connection timed out')), 5000);
            req.once('socket', socket => {
                const startResponseTimer = () => {
                    clearTimeout(connectionTimer);
                    if (!failed && !ended) {
                        timer = setTimeout(() => fail(new TimeoutError('Sandbox file request timed out')), 5000);
                    }
                };
                if (socket.connecting) socket.once('connect', startResponseTimer);
                else startResponseTimer();
            });
            req.setTimeout(5000, () => fail(new TimeoutError('Sandbox file request timed out')));
        } else if (timeout > 0) {
            timer = setTimeout(() => fail(new TimeoutError('Sandbox file request timed out')), timeout);
        }
        if (options.stream) {
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
