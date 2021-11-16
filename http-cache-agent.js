const
	_os = require('os'),
	_fs = require('fs'),
	_path = require('path'),
	_crypto = require('crypto'),
	_net = require('net'),
	_http = require("http"),
	_https = require("https")
;

function CacheSocket(file, cb) {
	var stream = _fs.createReadStream(file);

	var srv = _net.createServer(function(sock) {
		sock.on('data', function (chunk) {
			stream.pipe(sock);
			stream.on('end', function () {
				sock.end();
				srv.close();
			});
		});
	});

	var socket = new _net.Socket();

	srv.listen(0, function() {
		socket.connect({host: '127.0.0.1', port: srv.address().port});
		cb(socket);
	});

	return socket;
}

function readCacheHeaderSync(file) {
	let fd = _fs.openSync(file, 'r');
	let data = Buffer.alloc(1024);
	let offset = 0;
	var spos = -1;
	var head = '';
	var bytes = 0;
	do {
		bytes = _fs.readSync(fd, data, offset, 1024, 0);
		if ((spos = data.indexOf("\r\n\r\n")) > -1) {
			head += data.slice(0, spos);
		} else {
			head += data.slice(0, spos);
		}
		offset = offset+1024;
	} while (spos === -1 && bytes > 0);

	_fs.closeSync(fd);

	return head;
}

function parseHead(head) {
	var res = {};
	var lines = head.split("\r\n");
	var tmp;

	for (var i=0; i < lines.length; i++) {
		if (lines[i] === '') continue;
		if (i === 0) {
			tmp = lines[i].split(' ');
			res.protocol = tmp[0];
			res.statusCode = tmp[1];
			res.statusMessage = tmp[2];
		}
		else if (lines[i].indexOf(':') > -1) {
			tmp = lines[i].split(':');
			res[tmp.shift().toLowerCase()] = tmp.join(':');
		}
		else {
			res[lines[i]] = null;
		}
	}
	return res;
}

/**
 * @extends {module:http.Agent|module:https.Agent}
 * @constructor
 * @param {Init.AgentOptions|{path: string, prefix: string}} opt
 * @param agent
 */
function Agent(opt, agent) {
	if (!agent) agent = new _http.Agent(opt);

	this.__proto__ = agent.__proto__;
	//this.constructor.prototype = agent.constructor.prototype;
	Object.assign(this,agent);

	this.callbackOrig = agent.constructor.prototype.callback;
	this.createConnectionOrig = agent.constructor.prototype.createConnection;

	var _this = this;
	this.path = opt.path;
	this.prefix = opt.prefix;

	this.getKey = function (options) {
		if (!options.href) {
			options.href = '';

			if (!options.protocol) {
				if (options.port === 443) options.protocol = 'https:';
				else options.protocol = 'http:';
			}
			options.href += options.protocol+'//';
			if (options.auth) options.href += options.auth+'@';
			options.href += options.host;
			if (options.port) {
				if (
					(options.href.indexOf('http:') > -1 && options.port !== 80) ||
					(options.href.indexOf('https:') > -1 && options.port !== 443) ||
					(options.href.indexOf('http:') < 0 && options.href.indexOf('https:') < 0)
				) {
					options.href += ':'+options.port;
				}
			}
			options.href += options.pathname || options.path || '/';
			if (options.query) options.href += '?'+options.query;
			else if (options.search) options.href += options.search;
		}
		var data = [options.href];
		if (options.method) data.push(options.method);
		if (options.protocol) data.push(options.protocol);
		if (options.headers) data.push(JSON.stringify(options.headers));

		var md5sum = _crypto.createHash('md5');
		md5sum.update(data.join('|'));

		return md5sum.digest('hex');
	};

	this.getCacheFilePath = function (options) {
		var key = this.getKey(options);
		var fp = _path.normalize(this.path + _path.sep + this.prefix + key);
		return _path.normalize(this.path + _path.sep + this.prefix + key) + '.cache';
	};

	this.createCache = function (socket, file) {
		var cstream;
		var head = Buffer.alloc(0);
		var spos = -1;
		socket.on('data', function (data) {
			if (head !== null) {
				head = Buffer.concat([head, data], head.length+data.length);
				if ((spos = head.indexOf("\r\n\r\n")) > -1) {
					var body = head.slice(spos+4, head.length);
					head = head.slice(0, spos+4);
					var HeadObj = parseHead(head.toString());

					if (HeadObj.expires) {
						let expires = new Date(HeadObj.expires);
						if ((new Date()).getTime() < expires.getTime()) {
							cstream = _fs.createWriteStream(file);
						}
					}

					if (cstream) {
						cstream.write(head);
						cstream.write(body);
					}
					head = null;
				}
			} else {
				if (cstream) cstream.write(data);
			}
		});

		socket.on('end', function (data) {
			if (cstream) cstream.close();
		});
	};

	this.isCached = function (file) {
		try {
			if (_fs.existsSync(file)) {
				var head = readCacheHeaderSync(file);
				var HeadObj = parseHead(head);
				if (HeadObj.expires) {
					let expires = new Date(HeadObj.expires);
					if ((new Date()).getTime() < expires.getTime()) {
						return true;
					}
				}
			}
		} catch (e) {
			debugger;
		}

		return false;
	}

	this.createConnection = function (options, callback) {
		var cacheFile = this.getCacheFilePath(options);
		//console.info('Cache: ', cacheFile);

		if (this.isCached(cacheFile)) {
			return CacheSocket(cacheFile, callback);
		}

		var socket = this.createConnectionOrig(options, callback);
		_this.createCache(socket, cacheFile);
		return socket;
	};

	this.callback = function(req, options) {
		var promise = null;
		var cacheFile = this.getCacheFilePath(options);

		//console.info('Cache: ',cacheFile);

		if (this.isCached(cacheFile)) {
			promise = new Promise(function (resolve, reject) {
				try {
					CacheSocket(cacheFile, function (socket) {
						socket.on('connect', function () {
							resolve(socket);
						});
						socket.on('error', function (err) {
							reject(err);
						});
					});
				} catch (e) {
					reject(e);
				}
			});
		}

		// Create default request socket
		if (!promise) {
			promise = this.callbackOrig(req, options);
			promise.then(function (socket) {
				_this.createCache(socket, cacheFile);
			});
		}

		return promise;
	}
}

function Init() {
	var _this = this;

	this.path = _os.tmpdir();
	this.prefix = 'node_ca_';

	try {
		if (!_fs.statSync(this.path).isDirectory()) {
			throw new Error('No temp folder found');
		}
	} catch (e) {
		var check = [
			_path.dirname(__filename)+_path.sep+'temp',
			_path.dirname(_path.dirname(__filename))+_path.sep+'temp',
			_path.dirname(_path.dirname(_path.dirname(__filename)))+_path.sep+'temp',
			_path.dirname(_path.dirname(_path.dirname(_path.dirname(__filename))))+_path.sep+'temp'
		];
		while(check.length > 0) {
			var p = check.shift();
			try {
				if (_fs.statSync(p).isDirectory()) {
					this.path = p;
					break;
				}
			} catch (e) {}
		}
	}

	/**
	 * @param {*} [opt]
	 * @constructor
	 */
	this._opt = function (opt) {
		if (!opt) opt = {};
		opt.path = opt.path || _this.path;
		opt.prefix = (typeof opt.prefix !== "string") ? _this.prefix : opt.prefix;
		return opt;
	};

	/**
	 *
	 * @param {{path:string, prefix:string}|null} [opt] Other options in https://nodejs.org/api/http.html#new-agentoptions
	 * @param {module:http.Agent} [agent]
	 * @return {Agent}
	 */
	this.http = function (opt, agent) {
		opt = this._opt(opt);
		if (!agent) agent = new _http.Agent(opt);
		return new Agent(opt, agent);
	};

	/**
	 *
	 * @param {{}} [opt]
	 * @param {module:http.Agent} [agent]
	 * @return {Agent}
	 */
	this.https = function (opt, agent) {
		opt = this._opt(opt);
		if (!agent) agent = new _https.Agent(opt);
		return new Agent(opt, agent);
	};

	this.getCacheFiles = function (opt, cb) {
		opt = this._opt(opt);
		var pcheck;
		if (opt.prefix !== '') pcheck = function (file) { return file.indexOf(opt.prefix) === 0; };
		else pcheck = function () { return true; };

		var scheck = function (file) {
			return file.indexOf('.cache') === file.length-6;
		};

		_fs.readdir(opt.path, function (err, files) {
			if (err) {
				if (cb) cb(err);
				return;
			}

			var result = [];
			for (var i=0; i < files.length;i++) {
				if (pcheck(files[i]) && scheck(files[i])) {
					result.push(files[i]);
				}
			}

			if (cb) cb(null, result);
		});
	};

	this.cleanup = function (opt, cb) {
		if (typeof opt == "function" && !cb) {
			cb = opt;
			opt = null;
		}

		opt = this._opt(opt);

		this.getCacheFiles(opt, function (err, files) {
			if (err) {
				if (cb) cb(err);
				return;
			}

			for (var i=0; i < files.length;i++) {
				var fp = _path.normalize(opt.path + _path.sep + files[i]);
				try {
					var head = readCacheHeaderSync(fp);
					var HeadObj = parseHead(head);
					let expires = new Date(HeadObj.expires);
					if ((new Date()).getTime() > expires.getTime()) {
						_fs.unlinkSync(fp);
					}
				} catch (e) {
					if (!err) err = e;
					else err.message += "\n"+e.message;
				}
			}

			if (cb) cb(err);
		});
	};

	this.reset = function (opt, cb) {
		if (typeof opt == "function" && !cb) {
			cb = opt;
			opt = null;
		}

		opt = this._opt(opt);

		var errors = [];
		this.getCacheFiles(opt, function (err, files) {
			if (err) {
				errors.push(err);
				if (cb) cb(errors.length > 0 ? errors : null);
				return;
			}

			var _queuHanldle = function (index, qcb) {
				if (index < files.length) {
					var file = files[index];
					var fp = _path.normalize(opt.path + _path.sep + file);
					var fpc = fp + '.tmp';
					var rstream = _fs.createReadStream(fp);
					var wstream;

					rstream.on('data', function (chunk) {
						if (!wstream) {
							wstream = _fs.createWriteStream(fpc);
							wstream.on('error', function (err) {
								errors.push(err);
								rstream.close();
							})
						}
						var begin = chunk.indexOf('Expires:');
						if (begin > -1) {
							wstream.write(chunk.slice(0, begin));
							wstream.write('Expires: ' + (new Date(1970, 0, 1, 1, 0, 0)).toGMTString());

							var end = chunk.indexOf("\r\n", begin);
							if (end > -1) {
								wstream.write(chunk.slice(end));
							}
						} else {
							wstream.write(chunk);
						}
					});
					rstream.on('error', function (err) {
						errors.push(err);
					});

					rstream.on('close', function () {
						if (wstream) {
							wstream.close();
							wstream = null
						}

						if (errors.length < 1) {
							_fs.unlink(fp, function (err) {
								if (err) {
									errors.push(err);
									_fs.unlink(fpc, function (err) {
										if (err) errors.push(err);
										_queuHanldle(index+1, qcb);
									});
									return;
								}

								_fs.rename(fpc, fp, function (err) {
									if (err) errors.push(err);
									_queuHanldle(index+1, qcb);
								});
							});
							return;
						}

						_queuHanldle(index+1, qcb);
					})
				}
				else qcb();
			}

			_queuHanldle(0, function () {
				if (cb) cb(errors.length > 0 ? errors : null);
			});
		});
	}
}

module.exports = new Init();