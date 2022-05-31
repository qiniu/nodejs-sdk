var conf = require('../conf');

exports.Mac = Mac;

const defaultOptions = {
    disableQiniuTimestampSignature: null
};

function Mac (accessKey, secretKey, options) {
    this.accessKey = accessKey || conf.ACCESS_KEY;
    this.secretKey = secretKey || conf.SECRET_KEY;
    this.options = Object.assign({}, defaultOptions, options);
}
