var qiniu = require('../');
var should = require('should');
var path = require('path');

qiniu.conf.ACCESS_KEY = process.env.QINIU_ACCESS_KEY;
qiniu.conf.SECRET_KEY = process.env.QINIU_SECRET_KEY;

var TEST_BUCKET = process.env.QINIU_TEST_BUCKET;
var TEST_DOMAIN = process.env.QINIU_TEST_DOMAIN;

var imageFile = path.join(__dirname, 'logo.png');

var logo  = Math.random() + 'logo.png';
var logo1 = Math.random() + 'logo1.png';
var logo2 = Math.random() + 'logo2.png';
var logo3 = Math.random() + 'logo3.png';
var logo4 = Math.random() + 'logo4.png';
var logo5 = Math.random() + 'logo5.png';
var logo6 = Math.random() + 'logo6.png';
var logo7 = Math.random() + 'logo7.png';



describe('test start step3:', function() {
    describe('fs.test.js', function() {
        var cdnManager = new qiniu.rs.CdnManager();

        before(function(done) {
            var putPolicy = new qiniu.rs.PutPolicy(
                TEST_BUCKET
            );
            var uptoken = putPolicy.token();

            qiniu.io.putFile(uptoken, logo, imageFile, null, function(err, ret) {
                should.not.exist(err);
            });

            qiniu.io.putFile(uptoken, logo2, imageFile, null, function(err, ret) {
                should.not.exist(err);
                done();
            });
        });
});
});
