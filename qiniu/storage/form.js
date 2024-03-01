const fs = require('fs');
const path = require('path');
const Readable = require('stream').Readable;

const getCrc32 = require('crc32');
const mime = require('mime');
const FormStream = require('formstream');

const conf = require('../conf');
const util = require('../util');
const rpc = require('../rpc');
const { SERVICE_NAME } = require('../httpc/region');
const { ResponseWrapper } = require('../httpc/responseWrapper');
const { EndpointsRetryPolicy } = require('../httpc/endpointsRetryPolicy');
const { RegionsRetryPolicy } = require('../httpc/regionsRetryPolicy');
const { Retrier } = require('../retry');
const { wrapTryCallback } = require('./internal');

exports.FormUploader = FormUploader;
exports.PutExtra = PutExtra;

/**
 * @class
 * @param {conf.Config} [config]
 * @constructor
 */
function FormUploader (config) {
    this.config = config || new conf.Config();
}

/**
 * @private
 * @param {Object} options
 * @param {string} options.accessKey
 * @param {string} options.bucketName
 * @param {boolean} [options.retryable]
 * @returns {Promise<Retrier>}
 */
FormUploader.prototype._getRegionsRetrier = function (options) {
    const {
        bucketName,
        accessKey,
        retryable = true
    } = options;

    return this.config.getRegionsProvider({
        bucketName,
        accessKey
    })
        .then(regionsProvider => {
            const retryPolicies = [
                new EndpointsRetryPolicy({
                    skipInitContext: true
                }),
                new RegionsRetryPolicy({
                    regionsProvider,
                    serviceName: SERVICE_NAME.UP
                })
            ];

            return new Retrier({
                retryPolicies,
                onBeforeRetry: context => retryable && context.result.needRetry()
            });
        });
};

/**
 * 上传可选参数
 * @class
 * @constructor
 * @param {string} [fname] 请求体中的文件的名称
 * @param {Object} [params] 额外参数设置，参数名称必须以x:开头
 * @param {string} [mimeType] 指定文件的mimeType
 * @param {string} [crc32] 指定文件的crc32值
 * @param {number | boolean} [checkCrc] 指定是否检测文件的crc32值
 * @param {Object} [metadata] 元数据设置，参数名称必须以 x-qn-meta-${name}: 开头
 */
function PutExtra (
    fname,
    params,
    mimeType,
    crc32,
    checkCrc,
    metadata
) {
    this.fname = fname || '';
    this.params = params || {};
    this.mimeType = mimeType || null;
    this.crc32 = crc32 || null;
    this.checkCrc = checkCrc || true;
    this.metadata = metadata || {};
}

/**
 * @callback reqCallback
 *
 * @param { Error } err
 * @param { Object } ret
 * @param { http.IncomingMessage } info
 */

/**
 * @typedef UploadResult
 * @property {any} data
 * @property {http.IncomingMessage} resp
 */

/**
 * @param {string} uploadToken
 * @param {string | null} key
 * @param {stream.Readable} fsStream
 * @param {PutExtra | null} putExtra
 * @param {reqCallback} callbackFunc
 * @returns {Promise<UploadResult>}
 */
FormUploader.prototype.putStream = function (
    uploadToken,
    key,
    fsStream,
    putExtra,
    callbackFunc
) {
    const preferredScheme = this.config.useHttpsDomain ? 'https' : 'http';

    // PutExtra
    putExtra = getDefaultPutExtra(
        putExtra,
        {
            key
        }
    );

    // Why need retrier even if retryable is false?
    // Because the retrier is used to get the endpoints,
    // which will be initialed by region policy.
    return this._getRegionsRetrier({
        bucketName: util.getBucketFromUptoken(uploadToken),
        accessKey: util.getAKFromUptoken(uploadToken),
        retryable: false
    })
        .then(retrier => Promise.all([
            retrier,
            retrier.initContext()
        ]))
        .then(([retrier, context]) => retrier.retry({
            func: context => putReq(
                context.endpoint.getValue({ scheme: preferredScheme }),
                uploadToken,
                key,
                fsStream,
                putExtra,
                callbackFunc
            ),
            context
        }));
};

/**
 * @param {string} upDomain
 * @param {string} uploadToken
 * @param {string} key
 * @param {Readable} fsStream
 * @param {PutExtra} putExtra
 * @param {reqCallback} callbackFunc
 */
function putReq (
    upDomain,
    uploadToken,
    key,
    fsStream,
    putExtra,
    callbackFunc
) {
    const postForm = createMultipartForm(
        uploadToken,
        key,
        fsStream,
        putExtra
    );
    const wrappedCallback = wrapTryCallback(callbackFunc);
    return new Promise((resolve, reject) => {
        rpc.postMultipart(
            upDomain,
            postForm,
            function (err, data, resp) {
                if (err) {
                    err.resp = resp;
                    reject(err);
                    wrappedCallback(err, data, resp);
                    return;
                }
                resolve(new ResponseWrapper({
                    data,
                    resp
                }));
                wrappedCallback(err, data, resp);
            }
        );
    });
}

/**
 * 上传字节
 * @param {string} uploadToken
 * @param {string | null} key
 * @param {any} body
 * @param {PutExtra | null} putExtra
 * @param {reqCallback} callbackFunc
 * @returns {Promise<UploadResult>}
 */
FormUploader.prototype.put = function (
    uploadToken,
    key,
    body,
    putExtra,
    callbackFunc
) {
    const preferredScheme = this.config.useHttpsDomain ? 'https' : 'http';

    // initial PutExtra
    putExtra = getDefaultPutExtra(
        putExtra,
        {
            key
        }
    );

    const fsStream = new Readable();
    fsStream.push(body);
    fsStream.push(null);

    // initial retrier and try upload
    return this._getRegionsRetrier({
        bucketName: util.getBucketFromUptoken(uploadToken),
        accessKey: util.getAKFromUptoken(uploadToken)
    })
        .then(retrier => Promise.all([
            retrier,
            retrier.initContext()
        ]))
        .then(([retrier, context]) => retrier.retry({
            func: context => {
                const fsStream = new Readable();
                fsStream.push(body);
                fsStream.push(null);

                return putReq(
                    context.endpoint.getValue({ scheme: preferredScheme }),
                    uploadToken,
                    key,
                    fsStream,
                    putExtra,
                    callbackFunc
                );
            },
            context
        }));
};

/**
 * @param {string} uploadToken
 * @param {any} body
 * @param {PutExtra | null} putExtra
 * @param {reqCallback} callbackFunc
 * @returns {Promise<UploadResult>}
 */
FormUploader.prototype.putWithoutKey = function (
    uploadToken,
    body,
    putExtra,
    callbackFunc
) {
    return this.put(uploadToken, null, body, putExtra, callbackFunc);
};

/**
 * @param {string} uploadToken
 * @param {string | null} key
 * @param {stream.Readable} fsStream
 * @param {PutExtra | null} putExtra
 * @returns {FormStream}
 */
function createMultipartForm (uploadToken, key, fsStream, putExtra) {
    const postForm = new FormStream();
    postForm.field('token', uploadToken);
    if (key != null) {
        postForm.field('key', key);
    }
    // fix the bug of formstream
    // https://html.spec.whatwg.org/#multipart-form-data
    const escapeFname = putExtra.fname.replace(/"/g, '%22')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A');
    postForm.stream(
        'file',
        fsStream,
        escapeFname,
        putExtra.mimeType
    );

    // putExtra params
    for (const k in putExtra.params) {
        if (k.startsWith('x:')) {
            postForm.field(k, putExtra.params[k].toString());
        }
    }

    // putExtra metadata
    for (const metadataKey in putExtra.metadata) {
        if (metadataKey.startsWith('x-qn-meta-')) {
            postForm.field(metadataKey, putExtra.metadata[metadataKey].toString());
        }
    }

    let fileBody = [];
    fsStream.on('data', function (data) {
        fileBody.push(data);
    });

    fsStream.on('end', function () {
        if (putExtra.checkCrc) {
            if (putExtra.crc32 == null) {
                fileBody = Buffer.concat(fileBody);
                const bodyCrc32 = parseInt('0x' + getCrc32(fileBody));
                postForm.field('crc32', bodyCrc32.toString());
            } else {
                postForm.field('crc32', putExtra.crc32);
            }
        }
    });

    return postForm;
}

/** 上传本地文件
 * @param {string} uploadToken 上传凭证
 * @param {string | null} key 目标文件名
 * @param {string} localFile 本地文件路径
 * @param {PutExtra | null} putExtra 额外选项
 * @param callbackFunc 回调函数
 * @returns {Promise<UploadResult>}
 */
FormUploader.prototype.putFile = function (
    uploadToken,
    key,
    localFile,
    putExtra,
    callbackFunc
) {
    const preferredScheme = this.config.useHttpsDomain ? 'https' : 'http';

    // initial PutExtra
    putExtra = putExtra || new PutExtra();
    if (!putExtra.mimeType) {
        putExtra.mimeType = mime.getType(localFile);
    }

    if (!putExtra.fname) {
        putExtra.fname = path.basename(localFile);
    }

    putExtra = getDefaultPutExtra(
        putExtra,
        {
            key
        }
    );

    // initial retrier and try upload
    return this._getRegionsRetrier({
        bucketName: util.getBucketFromUptoken(uploadToken),
        accessKey: util.getAKFromUptoken(uploadToken)
    })
        .then(retrier => Promise.all([
            retrier,
            retrier.initContext()
        ]))
        .then(([retrier, context]) => retrier.retry({
            func: context => {
                const fsStream = fs.createReadStream(localFile);

                return putReq(
                    context.endpoint.getValue({ scheme: preferredScheme }),
                    uploadToken,
                    key,
                    fsStream,
                    putExtra,
                    callbackFunc
                );
            },
            context
        }));
};

/** 上传本地文件
 * @param {string} uploadToken 上传凭证
 * @param {string} localFile 本地文件路径
 * @param {PutExtra | null} putExtra 额外选项
 * @param callbackFunc 回调函数
 * @returns {Promise<UploadResult>}
 */
FormUploader.prototype.putFileWithoutKey = function (
    uploadToken,
    localFile,
    putExtra,
    callbackFunc
) {
    return this.putFile(uploadToken, null, localFile, putExtra, callbackFunc);
};

/**
 * @param {PutExtra} putExtra
 * @param {Object} options
 * @param {string} options.key
 * @return {PutExtra}
 */
function getDefaultPutExtra (putExtra, options) {
    putExtra = putExtra || new PutExtra();
    if (!putExtra.mimeType) {
        putExtra.mimeType = 'application/octet-stream';
    }

    if (!putExtra.fname) {
        putExtra.fname = options.key || 'fname';
    }

    return putExtra;
}
