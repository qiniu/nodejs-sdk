const should = require('should');
const assert = require('assert');
const qiniu = require('../index.js');
const proc = require('process');
const console = require('console');

// eslint-disable-next-line no-undef
before(function (done) {
    if (!process.env.QINIU_ACCESS_KEY || !process.env.QINIU_SECRET_KEY) {
        console.log('should run command `source test-env.sh` first\n');
        process.exit(0);
    }
    done();
});

// eslint-disable-next-line no-undef
describe('test rtc credentials', function () {
    var accessKey = proc.env.QINIU_ACCESS_KEY;
    var secretKey = proc.env.QINIU_SECRET_KEY;

    var credentials = new qiniu.Credentials(accessKey, secretKey);
    var appId = null;
    var appData = {
        hub: 'hailong',
        title: 'testtitle',
        maxUsers: 10,
        noAutoKickUser: true
    };

    after(function (done) {
        qiniu.app.deleteApp(appId, credentials, function () {
            done();
        });
    });

    // eslint-disable-next-line no-undef
    describe('test create app', function () {
        // eslint-disable-next-line no-undef
        it('create app', function (done) {
            qiniu.app.createApp(appData, credentials, function (err, res) {
                should.not.exist(err);
                should.exist(res.appId);
                assert.strictEqual(res.title, 'testtitle');
                appId = res.appId;
                done();
            });
        });
    });

    // eslint-disable-next-line no-undef
    describe('test update app', function () {
        // eslint-disable-next-line no-undef
        it('update app', function (done) {
            appData.title = 'testtitle2';
            qiniu.app.updateApp(appId, appData, credentials, function (err, res) {
                should.not.exist(err);
                assert.strictEqual(res.title, 'testtitle2');
                assert.strictEqual(res.appId, appId);
                done();
            });
        });
    });

    // eslint-disable-next-line no-undef
    describe('test get app', function () {
        // eslint-disable-next-line no-undef
        it('get app', function (done) {
            qiniu.app.getApp(appId, credentials, function (err, res) {
                should.not.exist(err);
                assert.strictEqual(res.title, 'testtitle2');
                assert.strictEqual(res.appId, appId);
                done();
            });
        });
    });

    // eslint-disable-next-line no-undef
    describe('test delete app', function () {
        // eslint-disable-next-line no-undef
        it('delete app', function (done) {
            qiniu.app.deleteApp(appId, credentials, function (err) {
                should.not.exist(err);
                done();
            });
        });
    });
});
