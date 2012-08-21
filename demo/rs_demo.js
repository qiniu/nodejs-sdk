var qiniu = require('../index.js');

qiniu.conf.ACCESS_KEY = '<Please apply your access key>';
qiniu.conf.SECRET_KEY = '<Dont send your secret key to anyone>';

var conn = new qiniu.digestauth.Client();

var bucket = 'bucket2';
var key = 'rs_demo.js';
var friendName = key;

var DEMO_DOMAIN = 'iovip.qbox.me/' + bucket;

var rs = new qiniu.rs.Service(conn, bucket);

rs.drop(function(resp) {
	console.log("\n===> Drop result: ", resp);

	rs.putFile(key, null, __filename, function(resp) {
		console.log("\n===> PutFile result: ", resp);
		if (resp.code != 200) {
			return;
		}

		rs.putAuth(function(resp) {
			console.log("\n===> PutAuth result: ", resp);
			if (resp.code != 200) {
				return;
			}

			rs.publish(DEMO_DOMAIN, function(resp) {
				console.log("\n===> Publish result: ", resp);
				if (resp.code != 200) {
					return;
				}

				rs.stat(key, function(resp) {
					console.log("\n===> Stat result: ", resp);
					if (resp.code != 200) {
						return;
					}

					rs.get(key, friendName, function(resp) {
						console.log("\n===> Get result: ", resp);
						if (resp.code != 200) {
							return;
						}

						rs.remove(key, function(resp) {
							console.log("\n===> Delete result: ", resp);
						});
					});
				});
			});
		});
	});
});

