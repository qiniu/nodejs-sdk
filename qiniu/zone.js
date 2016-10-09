var conf = require('./conf');
var request = require('sync-request');

exports.up_host = function (uptoken){
    if((new Date().getTime() > conf.DEADLINE) && conf.AUTOZONE){
        var ak = uptoken.toString().split(":")[0];
        var tokenPolicy = uptoken.toString().split(":")[2];
        var tokenPolicyStr = new Buffer(tokenPolicy, 'base64').toString();
        var json_tokenPolicyStr = JSON.parse(tokenPolicyStr);
        var bucket = json_tokenPolicyStr.scope;

        var res = request('GET', 'http://uc.qbox.me/v1/query?ak=' + ak + '&bucket=' + bucket, {
          'headers': {
            'Content-Type': 'application/json'
          }
        });

        if(res.statusCode == 200){
            var json_str = JSON.parse(res.body.toString());

            console.log(json_str);

            //判断设置使用的协议, 默认使用http
            if(conf.SCHEME == 'http'){
                conf.UP_HOST = json_str.http.up[1];
            }else{
                conf.UP_HOST = json_str.https.up[0];
            }

            conf.DEADLINE = json_str.ttl + new Date().getTime(); 

        }else{
            var err = new Error('Server responded with status code ' + res.statusCode + ':\n' + res.body.toString());
            err.statusCode = res.statusCode;
            err.headers = res.headers;
            err.body = res.body;
            throw err;
        }
    }

}
