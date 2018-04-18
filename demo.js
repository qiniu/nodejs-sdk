var Credentials = require('./rtc/credentials')
var App = require('./rtc/app')
var Room = require('./rtc/room')

var ACCESS_KEY  = 'DXFtikq1YuDT_WMUntOpzpWPm2UZVtEnYvN3-CUD';
var SECRET_KEY  = 'F397hzMohpORVZ-bBbb-IVbpdWlI4SWu8sWq78v3';
var credentials = new Credentials(ACCESS_KEY, SECRET_KEY)

// var data = {
//     'hub': 'hub',
//     'title': 'title',
//     'maxUsers': 10,
//     // 'noAutoCloesRoom': true,
//     // 'noAutoCreateRoom': true,
//     // 'noAutoKickUser' : true
// }

// App.createApp(data, credentials, function (err, res) {
//     if(err){
//         console.log(err)
//     } else {
//         console.log(res)
//     }
// })


// App.getApp('deufubscd', credentials, function (err, res) {
//     if(err){
//         console.log(err)
//     } else {
//         console.log(res)
//     }
// })

// App.deleteApp('desmfnkw5', credentials, function (err, res) {
//     if(err){
//         console.log(err)
//     } else {
//         console.log(res)
//     }
// })
//
// var data = {
//     'hub': 'hailong',
//     'title': 'yangjin',
//     'maxUsers': 10,
//     'noAutoCloseRoom': true,
//     'noAutoCreateRoom': true,
//     'noAutoKickUser' : true,
//     'mergePublishRtmp':{
//         'enable': true,
//         'audioOnly': true,
//         'height': 1920,
//         'width': 1080,
//         'fps': 60,
//         'kbps': 1000,
//         'url': 'rtmp://xxx.example.com/test',
//         'streamTitle': 'meeting'
//     }
// }
//

// App.updateApp('desmfnkw5', data, credentials, function (err, res) {
//     if(err){
//         console.log(err)
//     } else {
//         console.log(res)
//     }
// })


// Room.listUser('d7rqwfxqd', 'room1', credentials, function (err, res) {
//     if(err){
//         console.log(err)
//     } else {
//         console.log(res)
//     }
// })
//
// Room.kickUser('d7rqwfxqd', 'room1', '1231234',credentials, function (err, res) {
//     if(err){
//         console.log(err)
//     } else {
//         console.log(res)
//     }
// })

// Room.listActiveRoom('d7rqwfxqd', 'test', 5, 10 ,credentials, function (err, res) {
//     if(err){
//         console.log(err)
//     } else {
//         console.log(res)
//     }
// })

var roomAccess = {
       'appId' : 'd7rqwfxqd',
       'roomName' : 'roomName',
       'userId'   : 'user1',
       'expireAt' : 1524128577,
       'permission' : 'admin'
}

console.log(Room.roomToken(roomAccess, credentials))