var qiniu = require('./index.js')
const StringDecoder = require('string_decoder').StringDecoder;
const decoder = new StringDecoder('utf8');
var cdnManager = new qiniu.cdn.CdnManager();

cdnManager.getCdnLogList(['cdn.iorange.vip'],'2018-11-18',(err,respBody,
	respInfo)=>{
	var data = JSON.parse(decoder.write(Buffer.from(respInfo.data)));
	console.log(data.data['cdn.iorange.vip'][0]['url']) ;
});
