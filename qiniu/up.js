var conf = require('./conf');
var request = require('then-request');
var zone = require('./zone');
var fs = require('fs');
var util = require('./util')

exports.postWithBLK = postWithBLK;



function postWithBLK(uptoken, filePath, finishedBlockNum, finishedCtxList, key, callback) {
    zone.up_host(uptoken, conf);
    var readStream = fs.createReadStream(filePath);
    var fileSize = fs.statSync(filePath).size;
    var buffers = [];
    var passedLength = 0;
    var blockNum = 0;
    var ctxList = finishedCtxList;
    var fileName = util.urlsafeBase64Encode(key);

    readStream.on('data', function (chunk) {
        passedLength += chunk.length;
        buffers.push(chunk);
        if(passedLength % (4*1024*1024) == 0 || passedLength == fileSize) {
            var buffer = Buffer.concat(buffers);
            blockNum += 1;
            // console.log(blockNum);
            if(blockNum >= finishedBlockNum) {
                readStream.pause();
                postBlock(uptoken, buffer, function (res) {
                    if(res.statusCode != 200) {
                        callback( {
                            'res' : res.statusCode,
                            'blockNum' : blockNum,
                            'ctxList' : ctxList
                        });
                    } else {
                        readStream.resume();
                        //console.log(res.getBody('utf8'));
                        if (ctxList == null) {
                            ctxList = JSON.parse(res.getBody('utf8')).ctx + ',';
                        } else if (passedLength == fileSize) {
                            ctxList += JSON.parse(res.getBody('utf8')).ctx;
                        } else {
                            ctxList += JSON.parse(res.getBody('utf8')).ctx + ',';
                        }
                    }
                    // console.log(ctxList);
                });
            }
            buffers = [];
        }
    });

    readStream.on('end', function() {

        createFile(uptoken, passedLength, ctxList, fileName,function (res) {
            if(res.statusCode != 200) {
                callback({
                    'res' : res.statusCode,
                    'blockNum' : blockNum,
                    'ctxList' : ctxList
                });
            } else {
                callback({
                    'key' : JSON.parse(res.getBody('utf8')).key,
                    'blockNum' : blockNum
                });
            }
        });
    });


}

function postBlock(uptoken, block, onret) {
    var uri = conf.UP_HOST + '/mkblk/' + block.length;
  //  console.log(uri);
    var token = 'UpToken ' + uptoken;
  //  console.log(token);
    request('POST', uri, {
        'headers' : {
            'Authorization' : token
        },
        'body' : block,
        'retry' : true
    }).done(onret);

}

function createFile(uptoken, passedLength, ctxList, fileName, onret) {
    var uri =  conf.UP_HOST + '/mkfile/' + passedLength + '/key/' + fileName;
    var token = 'UpToken ' + uptoken;
    request('POST', uri, {
        'headers' : {
            'Authorization' : token
        },
        'body' : ctxList,
        'retry' : true
    }).done(onret);
}

