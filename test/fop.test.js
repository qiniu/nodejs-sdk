const qiniu = require('../index.js');
const should = require('should');
const proc = require('process');
const console = require('console');

// eslint-disable-next-line no-undef
before(function (done) {
    if (!process.env.QINIU_ACCESS_KEY || !process.env.QINIU_SECRET_KEY || !process.env.QINIU_TEST_BUCKET || !process.env.QINIU_TEST_DOMAIN) {
        console.log('should run command `source test-env.sh` first\n');
        process.exit(0);
    }
    done();
});

// eslint-disable-next-line no-undef
describe('test start fop', function () {
    var accessKey = proc.env.QINIU_ACCESS_KEY;
    var secretKey = proc.env.QINIU_SECRET_KEY;
    var srcBucket = proc.env.QINIU_TEST_BUCKET;
    var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    var config = new qiniu.conf.Config();
    config.useHttpsDomain = true;
    config.zone = qiniu.zone.Zone_z0;

    var persistentId;

    it('test video fop', function (done) {
        console.log(srcBucket);

        var pipeline = 'sdktest';
        var srcKey = 'qiniu.mp4';
        var operManager = new qiniu.fop.OperationManager(mac, config);

        // 处理指令集合
        var saveBucket = srcBucket;
        var fops = [
            'avthumb/mp4/s/480x320/vb/150k|saveas/' + qiniu.util.urlsafeBase64Encode(
                saveBucket + ':qiniu_480x320.mp4'),
            'vframe/jpg/offset/10|saveas/' + qiniu.util.urlsafeBase64Encode(
                saveBucket +
          ':qiniu_frame1.jpg')
        ];

        var options = {
            notifyURL: 'http://api.example.com/pfop/callback',
            force: false
        };

        // 持久化数据处理返回的是任务的persistentId，可以根据这个id查询处理状态
        operManager.pfop(srcBucket, srcKey, fops, pipeline, options,
            function (err, respBody, respInfo) {
                console.log(respBody, respInfo);
                should.not.exist(err);
                respBody.should.have.keys('persistentId');
                persistentId = respBody.persistentId;
                done();
            });
    });

    it('test video prefop', function (done) {
        var operManager = new qiniu.fop.OperationManager(mac, config);
        // 查询处理状态
        operManager.prefop(persistentId,
            function (err, respBody, respInfo) {
                console.log(respBody, respInfo);
                should.not.exist(err);
                respBody.should.have.keys('id', 'pipeline', 'inputBucket', 'inputKey');
                respBody.should.have.property('id', persistentId);
                done();
            });
    });
});
