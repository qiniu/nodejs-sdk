var qiniu = require('../');

var token = 'FMVCRs2-LO1ivRNi4l7mEPv-519D12kZCO:D7iNkCIKVtZ15FVIiCEIdIU=:eyJzY29wZSI6InvMSIsImRlYWRsaW5lIjoxNTMyMDU2NTIzfQ==';
var filePath = '111.mp4';

qiniu.up.postWithBLK(token, filePath, 0, null, 'key', function (res) {
    console.log(res);
});
