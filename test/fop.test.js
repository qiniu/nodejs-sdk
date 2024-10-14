const os = require('os');
const path = require('path');
const fs = require('fs');

const should = require('should');
const qiniu = require('../index.js');
const {
    checkEnvConfigOrExit,
    getEnvConfig,
    parametrize,
    createRandomFile
} = require('./conftest');

// file to upload
const testFilePath = path.join(os.tmpdir(), 'nodejs-sdk-test-fop.bin');

before(function () {
    checkEnvConfigOrExit();
    return Promise.all([
        createRandomFile(testFilePath, (1 << 20) * 5)
    ]);
});

after(() => {
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

describe('test start fop', function () {
    this.timeout(0);

    const {
        accessKey,
        secretKey,
        bucketName
    } = getEnvConfig();
    const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    const config = new qiniu.conf.Config();
    config.useHttpsDomain = true;
    config.zone = qiniu.zone.Zone_na0;

    let persistentId;

    const testParams = parametrize(
        {
            name: 'persistentType',
            values: [
                undefined,
                0,
                1
            ]
        }
    );

    testParams.forEach(function (testParam) {
        const {
            persistentType
        } = testParam;
        const msg = `params(${JSON.stringify(testParam)})`;

        it(`test video fop; ${msg}`, function (done) {
            let pipeline = 'sdktest';
            const srcKey = 'qiniu.mp4';
            const operationManager = new qiniu.fop.OperationManager(mac, config);

            // 处理指令集合
            const srcBucket = bucketName;
            const saveBucket = bucketName;
            const fop1 = [
                'avthumb/mp4/s/480x320/vb/150k|saveas/',
                qiniu.util.urlsafeBase64Encode(
                    `${saveBucket}:qiniu_480x320.mp4`
                )
            ].join('');
            const fop2 = [
                'vframe/jpg/offset/10|saveas/',
                qiniu.util.urlsafeBase64Encode(
                    `${saveBucket}:qiniu_frame1.jpg`
                )
            ].join('');
            const fops = [fop1, fop2];

            const options = {
                notifyURL: 'http://api.example.com/pfop/callback',
                force: false
            };

            if (persistentType !== undefined) {
                options.type = persistentType;
                pipeline = null;
            }

            // 持久化数据处理返回的是任务的persistentId，可以根据这个id查询处理状态
            operationManager.pfop(srcBucket, srcKey, fops, pipeline, options,
                function (err, respBody, respInfo) {
                    console.log(respBody, respInfo);
                    should.not.exist(err);
                    respBody.should.have.keys('persistentId');
                    persistentId = respBody.persistentId;
                    done();
                });
        });

        it(`test video prefop; ${msg}`, function (done) {
            const operationManager = new qiniu.fop.OperationManager(mac, config);
            // 查询处理状态
            operationManager.prefop(persistentId,
                function (err, respBody, respInfo) {
                    console.log(respBody, respInfo);
                    should.not.exist(err);
                    respBody.should.have.keys('id', 'pipeline', 'inputBucket', 'inputKey');
                    respBody.should.have.property('id', persistentId);
                    if (persistentType) {
                        should.equal(respBody.type, persistentType);
                    }
                    done();
                });
        });

        it(`test pfop with upload; ${msg}`, function () {
            const formUploader = new qiniu.form_up.FormUploader(config);
            const key = 'test-pfop/upload-file';
            const persistentKey = [
                'test-pfop/test-pfop-by-upload',
                'type',
                persistentType
            ].join('_');

            const fop1 = [
                'avinfo|saveas/',
                qiniu.util.urlsafeBase64Encode(
                    `${bucketName}:${persistentKey}`
                )
            ].join('');
            const options = {
                scope: bucketName,
                persistentOps: [
                    fop1
                ].join(';'),
                persistentType
            };
            const putPolicy = new qiniu.rs.PutPolicy(options);
            const uploadToken = putPolicy.uploadToken(mac);
            const putExtra = new qiniu.form_up.PutExtra();

            return formUploader.put(uploadToken, key, testFilePath, putExtra)
                .then(({ data }) => {
                    data.should.have.keys('key', 'persistentId');

                    return new Promise((resolve, reject) => {
                        new qiniu.fop.OperationManager(mac, config)
                            .prefop(
                                data.persistentId,
                                function (err, respBody, respInfo) {
                                    if (err) {
                                        reject(err);
                                        return;
                                    }
                                    resolve({ data: respBody, resp: respInfo });
                                }
                            );
                    });
                })
                .then(({ data }) => {
                    data.should.have.keys('creationDate');
                    if (persistentType) {
                        should.equal(data.type, persistentType);
                    }
                });
        });
    });

    it('test pfop by templateID with api', function () {
        const srcKey = 'qiniu.mp4';
        const srcBucket = bucketName;

        const templateID = 'test-workflow';
        const operationManager = new qiniu.fop.OperationManager(mac, config);

        new Promise((resolve, reject) => {
            operationManager.pfop(
                srcBucket,
                srcKey,
                null,
                null,
                { workflowTemplateID: templateID },
                function (err, respBody, respInfo) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve({ data: respBody, resp: respInfo });
                }
            );
        })
            .then(({ data }) => {
                data.should.have.keys('persistentId');
                return new Promise((resolve, reject) => {
                    operationManager.prefop(
                        data.persistentId,
                        function (err, respBody, respInfo) {
                            if (err) {
                                reject(err);
                                return;
                            }
                            resolve({ data: respBody, resp: respInfo });
                        }
                    );
                });
            })
            .then(({ data }) => {
                data.should.have.keys(
                    'creationDate',
                    'taskFrom'
                );
            });
    });

    it('test pfop by templateID with upload', function () {
        const formUploader = new qiniu.form_up.FormUploader(config);
        const key = 'qiniu-pfop-tplid-upload-file';
        const templateID = 'test-workflow';
        const options = {
            scope: bucketName,
            persistentWorkflowTemplateID: templateID
        };
        const putPolicy = new qiniu.rs.PutPolicy(options);
        const uploadToken = putPolicy.uploadToken(mac);
        const putExtra = new qiniu.form_up.PutExtra();

        return formUploader.put(uploadToken, key, testFilePath, putExtra)
            .then(({ data }) => {
                data.should.have.keys('key', 'persistentId');
                return new Promise((resolve, reject) => {
                    new qiniu.fop.OperationManager(mac, config)
                        .prefop(
                            data.persistentId,
                            function (err, respBody, respInfo) {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                resolve({ data: respBody, resp: respInfo });
                            }
                        );
                });
            })
            .then(({ data }) => {
                data.should.have.keys(
                    'creationDate',
                    'taskFrom'
                );
            });
    });
});
