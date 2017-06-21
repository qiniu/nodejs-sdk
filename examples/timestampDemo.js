/**
 * Created by guhao on 2017/3/25.
 */
var qiniu = require('../');

var url = '<url1>';
var key = 'key';
var time = 3600;

var uri = qiniu.util.getTimestampWithUrl( url, key, time);
console.log(uri);
