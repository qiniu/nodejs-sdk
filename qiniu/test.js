var cdnManager = require('./cdnManager');
var conf = require('./conf');

conf.ACCESS_KEY = 'JmTcjiVWsoRxql3OA2krgoW-Fu9bzBZZGCd2lXem';
conf.SECRET_KEY = '9QcN67B1hrSgOzHUZdjOfhiuGdM6NZ71JWo3sTVF';


// cdnManager.getCdnLogList('line-y.oversea.clouddn.com', '2016-12-13');

//cdnManager.getFluxData('2016-12-13','2016-12-13','5min','line-y.oversea.clouddn.com');

console.log('2');

//cdnManager.getBandwidthData('2016-12-13','2016-12-13','5min','line-y.oversea.clouddn.com');

//cdnManager.prefetch({urls:['http://obbid7qc6.qnssl.com/023']}); 需要需改

//cdnManager.refresh({urls:['http://obbid7qc6.qnssl.com/023']});

var t = cdnManager.getAntiLeechAccessUrlBasedOnTimestamp('http://yp-db.qiniuts.com/1.png?v=3','01ab7aa8bb9861bbc2999d9890abd289c3b94e99', 300);

console.log(t);

