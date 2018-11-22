var qiniu = require('./index.js')
var cdnManager = new qiniu.cdn.CdnManager();

var domains = [
   'img.blog.ijemy.com',
];
var logDay = '2018-11-22';
cdnManager.getCdnLogList(domains,logDay,(err,respBody,
	respInfo)=>{
	console.log('getLog-'+respInfo.statusCode);
	if(respInfo.statusCode==200){
		var body = JSON.parse(respBody);
		console.log(body);
		var logs = body.data;
		var log = logs[domains[0]];
		//console.log(log.length);
		if (log!=null){
			log.forEach((item)=>{
			console.log(item.url);
			});
		}
	}
});
