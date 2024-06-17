# File based HTTP & HTTPS Cache agent
Compatible with http-proxy-agent, https-proxy-agent and proxy-agent.

## Installation
```cmd
npm install --save http-cache-agent
```

## Changelog
2022-04-14
- FIX BUG SSL Connections
- FIX BUG if the process exited before the cache file was written 
- Change to Named pipe (no port using more)
- Added 'http-cache-agent.error' event to socket and request

## Usage JavaScript:
```javascript
const CacheAgent = require('http-cache-agent');
const https = require('https');

// Change path (default is temp)
CacheAgent.filepath = '/usr/local/tmp';
```

## Usage TypeScript:
```typescript
import * as CacheAgent from 'http-cache-agent';
import https from "https";

// Change path (default is temp)
CacheAgent.filepath = '/usr/local/tmp';
```


#### Get content
```javascript
var ca = CacheAgent.https(); // OR CacheAgent.auto()
var req = https.request(
   'https://www.google.de/manifest?pwa=webhp',
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

res.on('end', function () {
   console.info(data);
});

req.on('error', function(err) {
    console.error(error);
});

req.end();
```

#### Custom socket settings
```javascript
// rejectUnauthorized: false -> ignore certificate errors
var ca = CacheAgent.https({rejectUnauthorized: false});
var req = https.request(
   'https://www.google.de/manifest?pwa=webhp',
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

res.on('end', function () {
   console.info(data);
});

req.on('error', function(err) {
    console.error(error);
});

req.end();
```

#### Download
```javascript
var fs = require('fs');
var ca = CacheAgent.auto();
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
```

#### With http-proxy-agent
```javascript
var ProxyAgent = require('https-proxy-agent');
var pa = new ProxyAgent('http://localhost:8118');
var ca = CacheAgent.https(null, pa);

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
```

#### With proxy-agent
```javascript
var ProxyAgent = require('proxy-agent');
var pa = new ProxyAgent('http://localhost:8118');

var ca = CacheAgent.auto(null, pa);
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
```


#### Get request 
```javascript
var ca = CacheAgent.https();
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
```

#### Reset cache (set expires date to 1970-01-01T00:00:00) 
```javascript
CacheAgent.reset(function (err) {
   console.error(err);
});
```

#### Cleanup cache files (remove expired files)
```javascript
CacheAgent.cleanup(function (err) {
   console.error(err);
});
```

#### Get all cache files
```javascript
CacheAgent.getCacheFiles(function (err, files) {
   if (err) console.error(err);
   console.info(files);
});
```
