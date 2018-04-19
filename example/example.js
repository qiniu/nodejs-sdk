var QNRTC = require('../index.js')

//ak, sk 获取参考 https://developer.qiniu.com/dora/kb/3702/QiniuToken
var ACCESS_KEY  = '填写您的ak';
var SECRET_KEY  = '填写您的sk';
var credentials = new QNRTC.Credentials(ACCESS_KEY, SECRET_KEY)


//参考 https://github.com/pili-engineering/QNRTC-Server/blob/master/docs/api.md

var data = {
    'hub': 'hub',
    'title': 'title',
    'maxUsers': 10,
    'noAutoCloesRoom': true,
    'noAutoCreateRoom': true,
    'noAutoKickUser' : true
}

QNRTC.App.createApp(data, credentials, function (err, res) {
    if(err){
        console.log(err)
    } else {
        console.log(res)
    }
})

QNRTC.App.getApp('appId', credentials, function (err, res) {
    if(err){
        console.log(err)
    } else {
        console.log(res)
    }
})

QNRTC.App.deleteApp('appId', credentials, function (err, res) {
    if(err){
        console.log(err)
    } else {
        console.log(res)
    }
})

var data1 = {
    'hub': 'hub',
    'title': 'title',
    'maxUsers': 10,
    'noAutoCloseRoom': true,
    'noAutoCreateRoom': true,
    'noAutoKickUser' : true,
    'mergePublishRtmp':{
        'enable': true,
        'audioOnly': true,
        'height': 1920,
        'width': 1080,
        'fps': 60,
        'kbps': 1000,
        'url': 'rtmp://xxx.example.com/test',
        'streamTitle': 'meeting'
    }
}


QNRTC.App.updateApp('appId', data1, credentials, function (err, res) {
    if(err){
        console.log(err)
    } else {
        console.log(res)
    }
})


QNRTC.Room.listUser('appId', 'roomName', credentials, function (err, res) {
    if(err){
        console.log(err)
    } else {
        console.log(res)
    }
})

QNRTC.Room.kickUser('appId', 'roomName', 'userId',credentials, function (err, res) {
    if(err){
        console.log(err)
    } else {
        console.log(res)
    }
})

//type of(offset limit) =  Num  such as 5 10
QNRTC.Room.listActiveRoom('appId', 'prefix', 'offset', 'limit' ,credentials, function (err, res) {
    if(err){
        console.log(err)
    } else {
        console.log(res)
    }
})


//expireAt = 1524128577 or empty
var roomAccess = {
    'appId' : 'appId',
    'roomName' : 'roomName',
    'userId'   : 'userId',
    'expireAt' : 1524128577,
    'permission' : 'admin'
}

console.log(QNRTC.Room.roomToken(roomAccess, credentials))