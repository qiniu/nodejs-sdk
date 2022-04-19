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
describe('test start cdn', function () {
    this.timeout(0);

    var accessKey = proc.env.QINIU_ACCESS_KEY;
    var secretKey = proc.env.QINIU_SECRET_KEY;
    var domain = proc.env.QINIU_TEST_DOMAIN;
    var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    var cdnManager = new qiniu.cdn.CdnManager(mac);

    it('test getCdnLogList', function (done) {
        var day = (new Date()).toISOString().substring(0, 10);
        cdnManager.getCdnLogList([domain], day,
            function (err, respBody, respInfo) {
                console.log(respBody, respInfo);
                should.not.exist(err);
                respBody.should.have.keys('code', 'data');
                done();
            });
    });

    it('test getFluxData', function (done) {
        var today = new Date();
        var endDay = today.toISOString().substring(0, 10);
        today.setDate(today.getDate() - 30);
        var startDay = today.toISOString().substring(0, 10);
        cdnManager.getFluxData(startDay, endDay, '5hour', [domain],
            function (err, respBody, respInfo) {
                console.log(respBody, respInfo);
                should.not.exist(err);
                respBody.should.have.keys('code', 'data');
                done();
            });
    });

    it('test getBandwidthData', function (done) {
        var today = new Date();
        var endDay = today.toISOString().substring(0, 10);
        today.setDate(today.getDate() - 30);
        var startDay = today.toISOString().substring(0, 10);
        cdnManager.getBandwidthData(startDay, endDay, '5hour', [domain],
            function (err, respBody, respInfo) {
                console.log(respBody, respInfo);
                should.not.exist(err);
                respBody.should.have.keys('code', 'data');
                done();
            });
    });

    it('test prefetchUrls', function (done) {
        var urls = ['http://' + domain + '/qiniu.mp4'];
        cdnManager.prefetchUrls(urls,
            function (err, respBody, respInfo) {
                console.log(respBody, respInfo);
                should.not.exist(err);
                respBody.should.have.keys('code', 'taskIds', 'requestId');
                done();
            });
    });

    it('test refreshUrls', function (done) {
        var urls = ['http://' + domain + '/qiniu.mp4'];
        cdnManager.refreshUrls(urls,
            function (err, respBody, respInfo) {
                console.log(respBody, respInfo);
                should.not.exist(err);
                respBody.should.have.keys('code', 'taskIds', 'requestId');
                done();
            });
    });

    it('test refreshDirs', function (done) {
        var dirs = ['http://' + domain + '/'];
        cdnManager.refreshDirs(dirs,
            function (err, respBody, respInfo) {
                console.log(respBody, respInfo);
                should.not.exist(err);
                respBody.should.have.keys('code', 'taskIds', 'requestId');
                done();
            });
    });

    it('test refreshUrlsAndDirs', function (done) {
        var urls = ['http://' + domain + '/qiniu.mp4'];
        var dirs = ['http://' + domain + '/'];
        cdnManager.refreshUrlsAndDirs(urls, dirs,
            function (err, respBody, respInfo) {
                console.log(respBody, respInfo);
                should.not.exist(err);
                respBody.should.have.keys('code', 'taskIds', 'requestId');
                done();
            });
    });

    it('test createTimestampAntiLeechUrl', function (done) {
        var host = 'http://' + domain;
        var url = cdnManager.createTimestampAntiLeechUrl(host, 'qiniu.mp4', 'aa=23', 'encryptKey', 20);
        should.equal(url, host + '/qiniu.mp4?aa=23&sign=1a530a8baafe126145f49cb738a50c09&t=14');
        done();
    });
});
