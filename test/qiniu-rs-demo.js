var qiniu = require('../lib/qiniu-rs.js');

var bucket = 'test_bucket'
var key = 'qiniu-rs-demo.js';
var friendlyName = key;

var DEMO_DOMAIN = 'iovip.qbox.me/' + bucket;

var rs = qiniu.QiniuRS({
    "access_key": "<Please apply your access key>",
    "secret_key": "<Dont send your secret key to anyone>",
    "app_bucket": bucket,
});

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

					rs.get(key, friendlyName, function(resp) {
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

