var qiniu = require('qiniu');

qiniu.conf.ACCESS_KEY = 'FMVCRs2--519D12kZCO';
qiniu.conf.SECRET_KEY = 'InOXBls8alaPiRcKFw1iFJZxcoOvAeY';

var getPolicy = new qiniu.rs.GetPolicy(3600);

var downloadUrl = getPolicy.makeRequest('http://oqjwigzf2.bkt.clouddn.com/000001');

console.log(downloadUrl);

