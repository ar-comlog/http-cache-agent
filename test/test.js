const CacheAgent = require('../dist/http-cache-agent');
const http = require('http');
const https = require('https');

// Download
/*
var fs = require('fs');
var ca = CacheAgent.https();
var req = https.get(
	'https://www.google.de/favicon.ico',
	{agent: ca},
	function (res) {
		var stream = fs.createWriteStream('test.ico');
		res.pipe(stream);
	}
)
req.on('error', error => {
	console.error(error)
});

req.end();
/**/
/*
// Text
var ca = CacheAgent.https();
var req = https.request(
	'http://localtest.speedorder.de/_index.html',
	{agent: ca},
	function (res) {
		var data = '';
		res.on('data', function (chunk) {
			data += chunk
		});

		res.on('end', function () {
			console.info(data);
		});
	}
);

req.on('error', error => {
	console.error(error)
});

req.end();
/**/

// Proxy Agent
/*
var ProxyAgent = require('proxy-agent');
var pa = new ProxyAgent('http://localhost:8118');

//var ca = CacheAgent.auto(null, pa);
var ca = CacheAgent.auto({rejectUnauthorized: false});
var req = https.request(
	'https://www.google.de/favicon.ico',
	{agent: ca},
	function (res) {
		var data = '';
		res.on('data', function (chunk) {
			data += chunk
		});

		res.on('end', function () {
			console.info(data);
		});
	}
)
req.on('error', error => {
	console.error(error)
});

req.end();
/**/

// HTTP Proxy Agent
/*
var ProxyAgent = require('https-proxy-agent');
var pa = new ProxyAgent('http://localhost:8118');

//var Agent = require('../dist/agent');
//var pa = new Agent.default('http://localhost:8118');

//var ca = CacheAgent.https(null, pa);
var ca = CacheAgent.auto(null, pa);
var req = http.request(
	'http://localtest.speedorder.de/_index.html',
	{agent: ca},
	function (res) {
		var data = '';
		res.on('data', function (chunk) {
			data += chunk
		});

		res.on('end', function () {
			console.info(data);
		});
	}
)
req.on('error', error => {
	console.error(error)
});

req.end();
/**/


// Reset + cleanup
/*
CacheAgent.reset(function (err) {
	CacheAgent.cleanup(function (err) {

	});
});
/**/

CacheAgent.clear(function () {
	var ca = CacheAgent.auto();
	var req = https.get(
		'https://www.google.de/favicon.ico',
		{agent: ca},
		function(res) {
			console.log('STATUS: ' + res.statusCode);
			console.log('HEADERS: ' + JSON.stringify(res.headers));

			// Buffer the body entirely for processing as a whole.
			var bodyChunks = [];
			res.on('data', function(chunk) {
				// You can process streamed parts here...
				bodyChunks.push(chunk);
			}).on('end', function() {
				var body = Buffer.concat(bodyChunks);
				console.log('BODY: ' + body);
				// ...and/or process the entire body here.
			})
		}
	);

	req.on('error', function(e) {
		console.log('ERROR: ' + e.message);
	});

	req.end();
})

/**/