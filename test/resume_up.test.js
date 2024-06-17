const should = require('should');

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

const qiniu = require('../index.js');

const {
    Endpoint,
    Region,
    SERVICE_NAME
} = qiniu.httpc;

const {
    getEnvConfig,
    checkEnvConfigAndExit,
    createRandomFile,
    createRandomStreamAndMD5,
    doAndWrapResultPromises,
    parametrize
} = require('./conftest');
const { createResumeRecorderSync } = require('../qiniu/storage/resume');

const testFilePath = path.join(os.tmpdir(), 'nodejs-sdk-test.bin');

function getLocalFileMD5 (filepath) {
    return new Promise((resolve, reject) => {
        const md5 = crypto.createHash('md5');
        const stream = fs.createReadStream(filepath);
        stream.on('data', function (data) {
            md5.update(data);
        });
        stream.on('end', function () {
            resolve(md5.digest('hex'));
        });
        stream.on('error', function (err) {
            reject(err);
        });
    });
}

function getRemoteObjectHeadersAndMD5 (url) {
    return new Promise((resolve, reject) => {
        http.get(url, function (response) {
            if (response.statusCode !== 200) {
                reject(new Error(`GET ${url} Failed with status code ${response.statusCode}`));
                return;
            }
            const md5 = crypto.createHash('md5');
            response.on('data', function (data) {
                md5.update(data);
            });
            response.on('end', function () {
                resolve({
                    headers: response.headers,
                    md5: md5.digest('hex')
                });
            });
            response.on('error', function (err) {
                reject(err);
            });
        });
    });
}

before(function () {
    checkEnvConfigAndExit();

    return Promise.all([
        createRandomFile(testFilePath, (1 << 20) * 10)
    ]);
});

after(function () {
    return Promise.all(
        [
            testFilePath
        ].map(p => new Promise(resolve => {
            fs.unlink(p, err => {
                if (err && err.code !== 'ENOENT') {
                    console.log(`unlink ${p} failed`, err);
                }
                resolve();
            });
        }))
    );
});

// file to upload
describe('test resume up', function () {
    this.timeout(0);

    const {
        accessKey,
        secretKey,
        bucketName,
        domain
    } = getEnvConfig();

    const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    const config = new qiniu.conf.Config();
    config.useCdnDomain = true;
    config.useHttpsDomain = true;
    const bucketManager = new qiniu.rs.BucketManager(mac, config);

    const keysToDelete = [];
    after(function () {
        if (!keysToDelete.length) {
            return;
        }

        const deleteOps = keysToDelete.map(k =>
            qiniu.rs.deleteOp(bucketName, k)
        );

        return bucketManager.batch(deleteOps)
            .then(({ data, resp }) => {
                if (!Array.isArray(data)) {
                    console.log(resp);
                    return;
                }
                data.forEach(function (ret) {
                    ret.code.should.be.oneOf(200, 612);
                });
            });
    });

    const options = {
        scope: bucketName
    };
    const putPolicy = new qiniu.rs.PutPolicy(options);
    putPolicy.returnBody = '{"key":$(key),"hash":$(etag),"fname":$(fname),"var_1":$(x:var_1),"var_2":$(x:var_2)}';
    const uploadToken = putPolicy.uploadToken(mac);
    const resumeUploader = new qiniu.resume_up.ResumeUploader(config);

    const testParams = parametrize(
        {
            name: 'version',
            values: [
                undefined,
                'v1',
                'v2'
            ]
        },
        {
            name: 'partSize',
            values: [
                undefined,
                6 * 1024 * 1024
            ]
        },
        {
            name: 'mimeType',
            values: [
                undefined,
                'application/json'
            ]
        }
    );
    describe('test resume up#putFileWithoutKey', function () {
        testParams.forEach(function (testParam) {
            const {
                version,
                partSize,
                mimeType
            } = testParam;
            const msg = `params(${JSON.stringify(testParam)})`;

            // default is v1. v1 not support setting part size, skipping.
            if (
                (
                    version === undefined ||
                    version === 'v1'
                ) &&
                partSize !== undefined
            ) {
                return;
            }

            it(`test resume up#putFileWithoutKey; ${msg}`, function () {
                const putExtra = new qiniu.resume_up.PutExtra();
                putExtra.params = { 'x:var_1': 'val_1', 'x:var_2': 'val_2' };
                putExtra.metadata = {
                    'x-qn-meta-name': 'qiniu',
                    'x-qn-meta-age': '18'
                };

                if (version !== undefined) {
                    putExtra.version = version;
                }
                if (partSize !== undefined) {
                    putExtra.partSize = partSize;
                }
                if (mimeType !== undefined) {
                    putExtra.mimeType = mimeType;
                }

                const promises = doAndWrapResultPromises(callback =>
                    resumeUploader.putFileWithoutKey(
                        uploadToken,
                        testFilePath,
                        putExtra,
                        callback
                    )
                );

                let actualKey = '';
                const checkFunc = ({ data }) => {
                    data.should.have.keys('key', 'hash');

                    actualKey = data.key;
                    should(data.var_1).eql('val_1');
                    should(data.var_2).eql('val_2');
                };

                return promises.callback
                    .then(checkFunc)
                    .then(() => promises.native)
                    .then(checkFunc)
                    .then(() => {
                        if (actualKey) {
                            keysToDelete.push(actualKey);
                        }
                        return bucketManager.stat(bucketName, actualKey)
                            .then(({ data: statData }) => {
                                statData.should.have.keys('x-qn-meta');
                                should.equal(statData['x-qn-meta'].name, 'qiniu');
                                should.equal(statData['x-qn-meta'].age, '18');
                            });
                    });
            });
        });
    });

    describe('test resume up#putFile', function () {
        testParams.forEach(function (testParam) {
            const {
                version,
                partSize,
                mimeType
            } = testParam;
            const msg = `params(${JSON.stringify(testParam)})`;

            // default is v1. v1 not support setting part size, skipping.
            if (
                (
                    version === undefined ||
                    version === 'v1'
                ) &&
                partSize !== undefined
            ) {
                return;
            }

            it(`test resume up#putFile without resume; ${msg}`, function () {
                const putExtra = new qiniu.resume_up.PutExtra();
                if (version !== undefined) {
                    putExtra.version = version;
                }
                if (partSize !== undefined) {
                    putExtra.partSize = partSize;
                }
                if (mimeType !== undefined) {
                    putExtra.mimeType = mimeType;
                }
                const key = 'storage_putFile_test' + Math.floor(Math.random() * 100000);

                const promises = doAndWrapResultPromises(callback =>
                    resumeUploader.putFile(
                        uploadToken,
                        key,
                        testFilePath,
                        putExtra,
                        callback
                    )
                );

                const checkFunc = ({ data }) => {
                    data.should.have.keys('key', 'hash');
                };

                return promises.callback
                    .then(checkFunc)
                    .then(() => promises.native)
                    .then(checkFunc)
                    .then(() => {
                        keysToDelete.push(key);
                        return Promise.all([
                            getLocalFileMD5(testFilePath),
                            getRemoteObjectHeadersAndMD5(`http://${domain}/${key}`)
                        ])
                            .then(([
                                expectedMD5,
                                {
                                    headers: actualHeaders,
                                    md5: actualMD5
                                }
                            ]) => {
                                if (mimeType !== undefined) {
                                    should.equal(actualHeaders['content-type'], mimeType);
                                }
                                should.equal(actualMD5, expectedMD5);
                            });
                    });
            });
        });
    });

    describe('test resume up#putStream', function () {
        testParams.forEach(testParam => {
            const {
                version,
                partSize,
                mimeType
            } = testParam;
            const msg = `params(${JSON.stringify(testParam)})`;

            // default is v1. v1 not support setting part size, skipping.
            if (
                (
                    version === undefined ||
                    version === 'v1'
                ) &&
                partSize !== undefined
            ) {
                return;
            }

            it(`test resume up#putStream; ${msg}`, function () {
                const putExtra = new qiniu.resume_up.PutExtra();
                if (version !== undefined) {
                    putExtra.version = version;
                }
                if (partSize !== undefined) {
                    putExtra.partSize = partSize;
                }
                if (mimeType !== undefined) {
                    putExtra.mimeType = mimeType;
                }

                const key = 'storage_putStream_test' + Math.floor(Math.random() * 100000);

                const streamSize = 9 * 1024 * 1024;
                const {
                    stream,
                    md5: expectedMD5
                } = createRandomStreamAndMD5(streamSize);

                const promises = doAndWrapResultPromises(callback =>
                    resumeUploader.putStream(
                        uploadToken,
                        key,
                        stream,
                        streamSize,
                        putExtra,
                        callback
                    )
                );

                const checkFunc = ({ data }) => {
                    data.should.have.keys('key', 'hash');
                };

                return promises.callback
                    .then(checkFunc)
                    .then(() => promises.native)
                    .then(checkFunc)
                    .then(() => {
                        keysToDelete.push(key);
                    })
                    .then(() => getRemoteObjectHeadersAndMD5(
                        `http://${domain}/${key}`
                    ))
                    .then(({
                        headers: actualHeaders,
                        md5: actualMD5
                    }) => {
                        if (mimeType !== undefined) {
                            should.equal(actualHeaders['content-type'], mimeType);
                        }
                        should.equal(actualMD5, expectedMD5);
                    });
            });
        });
    });

    describe('test resume up#putFile resume', function () {
        const testParams = parametrize(
            {
                name: 'version',
                values: [
                    undefined,
                    'v1',
                    'v2'
                ]
            },
            {
                name: 'partSize',
                values: [
                    undefined,
                    6 * 1024 * 1024
                ]
            },
            {
                name: 'fileSizeMB',
                values: [2, 4, 6, 10]
            },
            {
                name: 'resumeRecorderOption',
                values: [
                    undefined, // resume record is disabled, default
                    {
                        baseDirPath: path.join(os.tmpdir(), 'SDKCustomDir'),
                        resumeKey: undefined
                    },
                    {
                        baseDirPath: path.join(os.tmpdir(), 'SDKCustomDir'),
                        resumeKey: 'some-resume-key.json'
                    }
                ]
            },
            {
                name: 'resumeRecordFile',
                values: [
                    undefined,
                    path.join(os.tmpdir(), 'some-resume-record-file.json')
                ]
            }
        );

        const filepathListToDelete = [];
        after(function () {
            return Promise.all(
                filepathListToDelete
                    .filter(p => p)
                    .map(p => new Promise(resolve => {
                        fs.unlink(p, err => {
                            if (err && err.code !== 'ENOENT') {
                                console.log(`unlink ${p} failed`, err);
                            }
                            resolve();
                        });
                    }))
            );
        });

        testParams.forEach(testParam => {
            const {
                version,
                partSize,
                fileSizeMB,
                resumeRecorderOption,
                resumeRecordFile
            } = testParam;
            const msg = `params(${JSON.stringify(testParam)})`;

            // default is v1. v1 not support setting part size, skipping.
            if (
                (
                    version === undefined ||
                    version === 'v1'
                ) &&
                partSize !== undefined
            ) {
                return;
            }

            it(`test resume up#putStream resume; ${msg}`, function () {
                const key = 'storage_putStream_resume_test' + Math.floor(Math.random() * 100000);

                const putExtra = new qiniu.resume_up.PutExtra();

                if (resumeRecordFile) {
                    putExtra.resumeRecordFile = resumeRecordFile;
                }

                if (resumeRecorderOption) {
                    putExtra.resumeRecorder = createResumeRecorderSync(resumeRecorderOption.baseDirPath);
                    putExtra.resumeKey = resumeRecorderOption.resumeKey;
                }

                if (version !== undefined) {
                    putExtra.version = version;
                }
                if (partSize !== undefined) {
                    putExtra.partSize = partSize;
                }

                const filepath = path.join(os.tmpdir(), key);
                const result = createRandomFile(filepath, fileSizeMB * (1 << 20))
                    .then(() => {
                        // add to auto clean file
                        filepathListToDelete.push(filepath);
                        filepathListToDelete.push(putExtra.resumeRecordFile);

                        // upload and abort
                        putExtra.progressCallback = (_uploaded, _total) => {
                            throw new Error('mocked error');
                        };
                        return resumeUploader.putFile(
                            uploadToken,
                            key,
                            filepath,
                            putExtra
                        )
                            .catch(err => {
                                if (!err.toString().includes('mocked error')) {
                                    return Promise.reject(err);
                                }
                            });
                    })
                    .then(() => {
                        // try to upload from resume point
                        const couldResume = Boolean(putExtra.resumeRecordFile || putExtra.resumeRecorder);
                        let isFirstPart = true;
                        putExtra.progressCallback = (uploaded, _total) => {
                            if (!isFirstPart) {
                                return;
                            }
                            isFirstPart = false;
                            if (couldResume && uploaded / partSize <= 1) {
                                throw new Error('should resume');
                            }
                            if (!couldResume && uploaded / partSize > 1) {
                                console.log('lihs debug:', { couldResume, uploaded });
                                throw new Error('should not resume');
                            }
                        };
                        return doAndWrapResultPromises(callback =>
                            resumeUploader.putFile(
                                uploadToken,
                                key,
                                filepath,
                                putExtra,
                                callback
                            )
                        );
                    });

                const checkFunc = ({ data }) => {
                    data.should.have.keys('key', 'hash');
                    if (resumeRecordFile) {
                        should.ok(!fs.existsSync(putExtra.resumeRecordFile));
                    } else if (resumeRecorderOption) {
                        if (resumeRecorderOption.resumeKey) {
                            should.ok(!fs.existsSync(
                                path.join(
                                    resumeRecorderOption.baseDirPath,
                                    resumeRecorderOption.resumeKey
                                )
                            ));
                        } else {
                            should.exist(putExtra.resumeRecorder);
                            let fileLastModify;
                            try {
                                fileLastModify = filepath && fs.statSync(filepath).mtimeMs.toString();
                            } catch (_err) {
                                fileLastModify = '';
                            }
                            const recordValuesToHash = [
                                putExtra.version,
                                accessKey,
                                `${bucketName}:${key}`,
                                filepath,
                                fileLastModify
                            ];
                            const expectResumeKey = putExtra.resumeRecorder.generateKey(recordValuesToHash);
                            should.ok(!fs.existsSync(
                                path.join(
                                    resumeRecorderOption.baseDirPath,
                                    expectResumeKey
                                )
                            ));
                        }
                    }
                };

                let promises = null;
                return result
                    .then(p => {
                        promises = p;
                        return promises.callback;
                    })
                    .then(checkFunc)
                    .then(() => promises.native)
                    .then(checkFunc)
                    .then(() => {
                        keysToDelete.push(key);
                    });
            });
        });
    });

    describe('test resume up#accelerateUploading', function () {
        const accConfig = new qiniu.conf.Config();
        accConfig.useHttpsDomain = true;
        accConfig.accelerateUploading = true;
        const accResumeUploader = new qiniu.resume_up.ResumeUploader(accConfig);
        const bucketNameWithoutAcc = 'bucket-without-acc-' + Math.floor(Math.random() * 100000);
        const accKeysToDelete = [];
        const accPutPolicy = new qiniu.rs.PutPolicy({
            scope: bucketNameWithoutAcc
        });
        const accUploadToken = accPutPolicy.uploadToken(mac);

        before(function () {
            return bucketManager.createBucket(bucketNameWithoutAcc);
        });

        after(function () {
            if (!accKeysToDelete.length) {
                return;
            }
            return bucketManager.batch(accKeysToDelete.map(k => qiniu.rs.deleteOp(bucketNameWithoutAcc, k)))
                .then(({ data, resp }) => {
                    if (!Array.isArray(data)) {
                        console.log(resp);
                    }
                    return bucketManager.deleteBucket(bucketNameWithoutAcc);
                });
        });

        testParams.forEach(function (testParam) {
            const {
                version,
                partSize,
                mimeType
            } = testParam;
            const msg = `params(${JSON.stringify(testParam)})`;

            // default is v1. v1 not support setting part size, skipping.
            if (
                (
                    version === undefined ||
                    version === 'v1'
                ) &&
                partSize !== undefined
            ) {
                return;
            }

            const putExtra = new qiniu.resume_up.PutExtra();
            if (version !== undefined) {
                putExtra.version = version;
            }
            if (partSize !== undefined) {
                putExtra.partSize = partSize;
            }
            if (mimeType !== undefined) {
                putExtra.mimeType = mimeType;
            }

            it(`upload acc normally; ${msg}`, function () {
                const key = 'storage_putFile_acc_test' + Math.floor(Math.random() * 100000);

                const promises = doAndWrapResultPromises(callback =>
                    accResumeUploader.putFile(uploadToken, key, testFilePath, putExtra, callback)
                );

                const checkFunc = ({ data, resp }) => {
                    const isAccelerateUploading = (resp.requestUrls || []).some(url => url.includes('kodo-accelerate'));
                    should.ok(isAccelerateUploading, `should using acc host, but requestUrls: ${JSON.stringify(resp.requestUrls)}`);
                    data.should.have.keys('key', 'hash');
                };

                return promises.callback
                    .then(checkFunc)
                    .then(() => promises.native)
                    .then(checkFunc)
                    .then(() => {
                        keysToDelete.push(key);
                    });
            });

            it(`upload acc unavailable fallback to src; ${msg}`, function () {
                const key = 'storage_putFile_acc_test' + Math.floor(Math.random() * 100000);

                const r1 = Region.fromRegionId('z0');
                r1.services[SERVICE_NAME.UP_ACC] = [
                    new Endpoint(`${bucketNameWithoutAcc}.kodo-accelerate.cn-east-1.qiniucs.com`),
                    new Endpoint('qn-up-acc.fake.qiniu.com')
                ];
                accConfig.regionsProvider = r1;

                const promises = doAndWrapResultPromises(callback =>
                    accResumeUploader.putFile(accUploadToken, key, testFilePath, putExtra, callback)
                );

                const checkFunc = ({ data }) => {
                    data.should.have.keys('key', 'hash');
                };

                return promises.callback
                    .then(checkFunc)
                    .then(() => promises.native)
                    .then(checkFunc)
                    .then(() => {
                        accKeysToDelete.push(key);
                    });
            });

            it(`upload acc network error fallback to src; ${msg}`, function () {
                const key = 'storage_putFile_acc_test' + Math.floor(Math.random() * 100000);

                const r1 = Region.fromRegionId('z0');
                r1.services[SERVICE_NAME.UP_ACC] = [
                    new Endpoint('qiniu-acc.fake.qiniu.com'),
                    new Endpoint('qn-up-acc.fake.qiniu.com')
                ];
                accConfig.regionsProvider = r1;

                const promises = doAndWrapResultPromises(callback =>
                    accResumeUploader.putFile(accUploadToken, key, testFilePath, putExtra)
                );

                const checkFunc = ({ data }) => {
                    data.should.have.keys('key', 'hash');
                };

                return promises.native
                    .then(checkFunc)
                    .then(() => promises.native)
                    .then(checkFunc)
                    .then(() => {
                        accKeysToDelete.push(key);
                    });
            });
        });
    });
});
