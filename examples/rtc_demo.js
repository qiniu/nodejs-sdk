const qiniu = require('../index.js')

// ak, sk 获取参考 https://developer.qiniu.com/dora/kb/3702/QiniuToken
var ACCESS_KEY = 'ak'
var SECRET_KEY = 'sk'
var credentials = new qiniu.Credentials(ACCESS_KEY, SECRET_KEY)

// 参考 https://github.com/pili-engineering/QNRTC-Server/blob/master/docs/api.md

var data = {
  'hub': 'your hub',
  'title': 'your title',
  'maxUsers': 10,
  'noAutoKickUser': true
}

qiniu.app.createApp(data, credentials, function (err, res) {
  if (err) {
    console.log(err)
  } else {
    console.log(res)
  }
})

qiniu.app.getApp('appId', credentials, function (err, res) {
  if (err) {
    console.log(err)
  } else {
    console.log(res)
  }
})

qiniu.app.deleteApp('appId', credentials, function (err, res) {
  if (err) {
    console.log(err)
  } else {
    console.log(res)
  }
})

var data1 = {
  'hub': 'your hub',
  'title': 'your title',
  'maxUsers': 10,
  'noAutoKickUser': true,
  'mergePublishRtmp': {
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
qiniu.app.updateApp('appId', data1, credentials, function (err, res) {
  if (err) {
    console.log(err)
  } else {
    console.log(res)
  }
})
qiniu.room.listUser('appId', 'roomName', credentials, function (err, res) {
  if (err) {
    console.log(err)
  } else {
    console.log(res)
  }
})

qiniu.room.kickUser('appId', 'roomName', 'userId', credentials, function (err, res) {
  if (err) {
    console.log(err)
  } else {
    console.log(res)
  }
})

// type of(offset limit) =  Num  such as 5 10
qiniu.room.listActiveRooms('appId', 'prefix', 'offset', 'limit', credentials, function (err, res) {
  if (err) {
    console.log(err)
  } else {
    console.log(res)
  }
})

// expireAt = 1524128577 or empty
var roomAccess = {
  'appId': 'your appId',
  'roomName': 'your roomName',
  'userId': 'userId',
  'expireAt': 1524128577,
  'permission': 'admin'
}

console.log(qiniu.room.getRoomToken(roomAccess, credentials))