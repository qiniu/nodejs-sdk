const qiniu = require("../index.js");
const proc = require("process");

var accessKey = proc.env.QINIU_ACCESS_KEY;
var secretKey = proc.env.QINIU_SECRET_KEY;

var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var reqURL = "http://serve.atlab.ai/v1/eval/facex-detect";
var contentType = 'application/json';
var reqBody = '{"data":{"uri":"https://ors35x6a7.qnssl.com/atshow-face-detection-20170703/1.png"}}';
var accessToken = qiniu.util.generateAccessTokenV2(mac, reqURL, 'POST', contentType, reqBody);
var headers = {
    'Authorization': accessToken,
    'Content-Type': contentType,
}

qiniu.rpc.post(reqURL, reqBody, headers, function(err, body, info) {
    console.log(info);
    console.log(body);
});