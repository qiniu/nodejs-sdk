const qiniu = require('../index.js');
const proc = require('process');
const should = require('should');
const assert = require('assert');

// eslint-disable-next-line no-undef
before(function(done) {
    if (!process.env.QINIU_ACCESS_KEY || !process.env.QINIU_SECRET_KEY) {
        console.log('should run command `source test-env.sh` first\n');
        process.exit(0);
    }
    done();
});

// message
describe('test Message', function() {
    var accessKey = proc.env.QINIU_ACCESS_KEY;
    var secretKey = proc.env.QINIU_SECRET_KEY;
    var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    // eslint-disable-next-line no-undef
    describe('test sendMessage', function() {
        // eslint-disable-next-line no-undef
        it('test sendMessage', function(done) {
            var num = new Array("17321129884","18120582893");
            var reqBody = {
                "template_id": "1199572412090290176",
                "mobiles": num,
                "parameters": {
                    "prize": "3333",
                    "name": "sendMessage",
                    "time": "1238"
                }
            };
            qiniu.sms.message.sendMessage(reqBody, mac, function(respErr, respBody,
                respInfo) {
                should.not.exist(respErr);
                assert.strictEqual(respInfo.statusCode, 200);
                done();
            });
        });
    });
    describe('test sendSingleMessage', function() {
        it('test sendSingleMessage', function(done) {
            var reqBody = {
                "template_id": "1199572412090290176",
                "mobile": "17321129884",
                "parameters": {
                    "prize": "3333",
                    "name": "sendSingleMessage",
                    "time": "1238"
                }
            };
            qiniu.sms.message.sendSingleMessage(reqBody, mac, function(respErr, respBody,
                respInfo) {
                should.not.exist(respErr);
                assert.strictEqual(respInfo.statusCode, 200);
                done();
            });
        });
    });
    describe('test sendOverseaMessage', function() {
        it('test sendOverseaMessage', function(done) {
            var reqBody = {
                "template_id": "1199572412090290176",
                "mobile": "17321129884",
                "parameters": {
                    "prize": "3333",
                    "name": "1111",
                    "time": "1238"
                }
            };
            qiniu.sms.message.sendOverseaMessage(reqBody, mac, function(respErr, respBody,
                respInfo) {
                should.not.exist(respErr);
                assert.strictEqual(respInfo.statusCode, 200);
                done();
            });
        });
    });
    describe('test sendFulltextMessage', function() {
        it('test sendFulltextMessage', function(done) {
            var num = new Array("17321129884","18120582893");
            var reqBody = {
                "mobiles": num,
                "content": "【七牛云-测试】您的验证码为1121，该验证码5分钟内有效",
                "template_type": "verification"
            };
            qiniu.sms.message.sendFulltextMessage(reqBody, mac, function(respErr, respBody,
                respInfo) {
                    if(respErr!=null){
                        console.log(respErr);
                    }
                should.not.exist(respErr);
                assert.strictEqual(respInfo.statusCode, 200);
                done();
            });
        });
    });
});
