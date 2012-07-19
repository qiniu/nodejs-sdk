var qiniu = require('../index.js');

qiniu.conf.ACCESS_KEY = '<Please apply your access key>';
qiniu.conf.SECRET_KEY = '<Dont send your secret key to anyone>';

var bucket = 'test_image_bucket';
var key = 'test.jpg'; // test.jpg must exists
var friendlyName = key;

var conn = new qiniu.digestauth.Client();
var rs = new qiniu.rs.Service(conn, bucket);

rs.drop(function(resp) {
	console.log("\n===> Drop result: ", resp);

	rs.putFile(key, "image/jpg", friendlyName, function(resp) {
		console.log("\n===> PutFile result: ", resp);
		if (resp.code != 200) {
			return;
		}

        rs.get(key, friendlyName, function(resp) {
            console.log("\n===> Get result: ", resp);
            if (resp.code != 200) {
                return;
            }
            var options = {
                "thumbnail": "!120x120r",
                "gravity": "center",
                "crop": "!120x120a0a0",
                "quality": 85,
                "rotate": 45,
                "format": "jpg",
                "auto_orient": true,
                "save_as": {"bucket": bucket, "key": "test-cropped.jpg"}
            };
            console.log("\n===> thumbnail url is: ", rs.thumbnail(resp.data.url, options));
            rs.thumbnailSaveAs(resp.data.url, options, function(resp){
                console.log("\n===> thumbnailSaveAs result: ", resp);
            });

		});
	});
});
