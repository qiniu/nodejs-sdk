/**
 * Created by guhao on 2017/3/25.
 */
var qiniu = require('../');

var url = 'http://pictures.gugaobai.top/qupload/Luffy.jpg?imageslim';
var key = 'dfa827aa79a9ab995fabfb9b68b80b98c689e58b';
var time = 3600;

var uri = qiniu.util.getTimestampWithUrl( url, key, time);
console.log(uri);
