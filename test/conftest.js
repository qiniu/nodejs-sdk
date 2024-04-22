const fs = require('fs');
const { Readable } = require('stream');
const crypto = require('crypto');

function getEnvConfig () {
    return {
        accessKey: process.env.QINIU_ACCESS_KEY,
        secretKey: process.env.QINIU_SECRET_KEY,
        bucketName: process.env.QINIU_TEST_BUCKET,
        domain: process.env.QINIU_TEST_DOMAIN
    };
}
exports.getEnvConfig = getEnvConfig;

function checkEnvConfigAndExit () {
    const envConfig = getEnvConfig();
    if (
        Object.keys(envConfig).some(k => !envConfig[k])
    ) {
        console.log('should run command `source test-env.sh` first\n');
        process.exit(0);
    }
}
exports.checkEnvConfigAndExit = checkEnvConfigAndExit;

/**
 * @typedef Param
 * @property {string} name
 * @property {any[]} values
 */

/**
 * cartesian product
 * @param {Param} params
 * @returns {Object<string, any>[]}
 */
function parametrize (...params) {
    if (params.length === 0) {
        return [{}];
    }

    const [param, ...rest] = params;

    const restParams = parametrize(...rest);

    return param.values
        .map(value =>
            restParams.map(restParam => Object.assign(
                {},
                restParam,
                {
                    [param.name]: value
                })
            )
        )
        .reduce((acc, val) => acc.concat(val), []);
}
exports.parametrize = parametrize;

/**
 * @param {string} filepath
 * @param {number} size
 * @returns {Promise<void>}
 */
function createRandomFile (filepath, size) {
    return new Promise((resolve, reject) => {
        fs.createReadStream('/dev/urandom', { end: size })
            .pipe(fs.createWriteStream(filepath))
            .on('finish', resolve)
            .on('error', reject);
    });
}
exports.createRandomFile = createRandomFile;

function createRandomStreamAndMD5 (size, chunkSize = 1024 * 1024) {
    const stream = new Readable();
    const md5 = crypto.createHash('md5');
    for (let offset = 0; offset < size; offset += chunkSize) {
        const bytesSize = Math.min(chunkSize, size - offset);
        const bytes = crypto.randomBytes(bytesSize);
        stream.push(bytes);
        md5.update(bytes);
    }
    stream.push(null);
    return {
        stream,
        md5: md5.digest('hex')
    };
}
exports.createRandomStreamAndMD5 = createRandomStreamAndMD5;

/**
 * for testing compatibility for both callback-style and promise-style
 * @param func
 * @returns {{callback: Promise<{data: any, resp: any}>, native: Promise<ResponseWrapper>}}
 */
function doAndWrapResultPromises (func) {
    const promises = {};
    promises.callback = new Promise((resolve, reject) => {
        promises.native = func((err, data, resp) => {
            if (err) {
                err.resp = resp;
                reject(err);
                return;
            }
            resolve({ data, resp });
        })
            .catch(err => {
                reject(err);
            });
    });
    return promises;
}
exports.doAndWrapResultPromises = doAndWrapResultPromises;

function getManuallyPromise () {
    let _resolve;
    let _reject;
    const promise = new Promise((resolve, reject) => {
        _resolve = resolve;
        _reject = reject;
    });

    // result.resolve = (...args) => {
    //     setTimeout(() => result._resolve(...args));
    // };
    // result.reject = (...args) => {
    //     setTimeout(() => result._reject(...args));
    // };

    return {
        promise,
        resolve: _resolve,
        reject: _reject
    };
}
exports.getManuallyPromise = getManuallyPromise;
