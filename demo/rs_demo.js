var digestauth = require('../qiniu/digestauth.js');
var qboxrs = require('../qiniu/rs.js');
var conf = require('../qiniu/conf.js');

conf.ACCESS_KEY = '<Please apply your access key>';
conf.SECRET_KEY = '<Dont send your secret key to anyone>';

var conn = new digestauth.Client();

var bucket = 'bucket';
var key = 'rs_demo.js';
var friendName = key;

var DEMO_DOMAIN = 'iovip.qbox.me/bucket';

var rs = new qboxrs.Service(conn, bucket);

rs.drop(function(resp) {
	console.log("\n===> Drop result: ", resp);

	rs.putFile(function(resp) {
		console.log("\n===> PutFile result: ", resp);
		if (resp.code != 200) {
			return;
		}

		rs.putAuth(function(resp) {
			console.log("\n===> PutAuth result: ", resp);
			if (resp.code != 200) {
				return;
			}

			rs.publish(function(resp) {
				console.log("\n===> Publish result: ", resp);
				if (resp.code != 200) {
					return;
				}
			
				rs.stat(function(resp) {
					console.log("\n===> Stat result: ", resp);
					if (resp.code != 200) {
						return;
					}

					rs.get(function(resp) {
						console.log("\n===> Get result: ", resp);
						if (resp.code != 200) {
							return;
						}

						rs.remove(function(resp) {
							console.log("\n===> Delete result: ", resp);
						}, key);

					}, key, friendName);

				}, key);

			}, DEMO_DOMAIN);

		});

	}, key, null, __filename);

});

