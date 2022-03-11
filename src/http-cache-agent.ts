import _os from 'os';
import _fs from 'fs';
import _path from 'path';
import _crypto from 'crypto';
import _net from 'net';
import _http from "http";
import _https from "https";
import Header from "./Header";
import _stream from "stream";
import net from "net";
import { Agent, ClientRequest, RequestOptions, AgentOptions } from 'agent-base';
import tls from "tls";

interface CAClientRequest extends ClientRequest {
	path: string;
	pathname: string;
}

interface CAOptions extends AgentOptions, tls.ConnectionOptions {
	filepath?: string,
	prefix?: string,
	secureEndpoint?: boolean,
	agent?: Agent,
}

function getKey(options: RequestOptions) {
	// @ts-ignore
	let href = options.href || null;

	if (!href) {
		href = '';

		if (!options.protocol) {
			if (options.port === 443) options.protocol = 'https:';
			else options.protocol = 'http:';
		}

		href += options.protocol+'//';
		if (options.auth) href += options.auth+'@';

		href += options.host;
		if (options.port) {
			if (
				(href.indexOf('http:') > -1 && options.port !== 80) ||
				(href.indexOf('https:') > -1 && options.port !== 443) ||
				(href.indexOf('http:') < 0 && href.indexOf('https:') < 0)
			) {
				href += ':'+options.port;
			}
		}

		// @ts-ignore
		href += options.pathname || options.path || '/';

		// @ts-ignore
		if (options.query) href += '?'+options.query;

		// @ts-ignore
		else if (options.search) options.href += options.search;
	}
	var data = [href];
	if (options.method) data.push(options.method);
	if (options.protocol) data.push(options.protocol);
	if (options.headers) data.push(JSON.stringify(options.headers));

	var md5sum = _crypto.createHash('md5');
	md5sum.update(data.join('|'));

	return md5sum.digest('hex');
}

function readCacheHeaderSync(file: string) {
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

function parseHead(head: string) : Header {
	var res = {} as Header;
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
			// @ts-ignore
			res[tmp.shift().toLowerCase()] = tmp.join(':');
		}
		else {
			// @ts-ignore
			res[lines[i]] = null;
		}
	}
	return res;
}

function createCache(socket: _stream.Duplex, file: string) {
	var cstream: _fs.WriteStream;
	var head : Buffer|null = Buffer.alloc(0);
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

	/*socket.on('error', function (err) {
		console.error(err);
	});*/

	socket.on('end', function () {
		if (cstream) cstream.close();
	});
}

function isCached(file: string) {
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
	} catch (e) {}

	return false;
}

/**
 *
 * @param {string} file
 * @param {Function} cb
 * @return {module:net.Socket}
 */
function CacheSocket(file: string, cb: Function) : _net.Socket {
	var stream = _fs.createReadStream(file);

	var srv = _net.createServer(function(sock) {
		sock.on('data', function (chunk) {
			stream.pipe(sock);
			stream.on('end', function () {
				sock.end();
				srv.close();
				if (stream) stream.close();
			});
		});
	});

	var socket = new _net.Socket();

	srv.listen(0, function() {
		// @ts-ignore
		socket.connect({host: '127.0.0.1', port: srv.address().port});
		cb(socket);
	});

	return socket;
}

class ComlogCacheAgent extends Agent {
	public agent?: _http.Agent | _https.Agent | Agent;
	public filepath =  _os.tmpdir();
	public prefix = 'node_ca_';
	public cache : CAOptions;

	public secureEndpoint = false;

	constructor(opt?: CAOptions, agent?: _http.Agent|_https.Agent|Agent) {
		super(opt);
		this.agent = agent ? agent : (opt && opt.agent ? opt.agent : undefined);
		if (opt) {
			if (typeof opt.filepath != 'undefined') {
				this.filepath = opt.filepath;
				delete opt.filepath;
			}
			if (typeof opt.prefix != 'undefined') {
				this.prefix = opt.prefix;
				delete opt.prefix;
			}
			this.cache = {...opt};
		}
		else this.cache = {};
	}

	/**
	 * Generate cache File path for Request
	 * @param {RequestOptions} options
	 */
	getCacheFilePath (options: RequestOptions) : string {
		var key = getKey(options);
		return _path.normalize(this.filepath + _path.sep + this.prefix + key) + '.cache';
	}

	/**
	 * Called when the node-core HTTP client library is creating a
	 * new HTTP request.
	 *
	 * @api protected
	 */
	async callback(
		request: CAClientRequest,
		options: RequestOptions,
		cb?: Function
	): Promise<net.Socket> {
		var _this = this;
		var promise = null;
		var cacheFile = this.getCacheFilePath(options);

		console.info('Cache: ',cacheFile);

		if (isCached(cacheFile)) {
			promise = new Promise(function (resolve, reject) {
				CacheSocket(cacheFile, function (socket: _stream.Duplex) {
					socket.on('connect', function () {
						resolve(socket);
					});
					socket.on('error', function (err) {
						reject(err);
					});
				});/**/
			});
		}

		// Create default request socket
		if (!promise) {
			options = Object.assign(options, _this.cache);

			var cached = false;
			var cb_send = false;
			if (this.agent) {
				// @ts-ignore
				if (this.agent.callback) {
					// @ts-ignore
					promise = this.agent.callback(request, options, cb);
				}
				// @ts-ignore
				else if (this.agent.createConnection) {
					promise = new Promise(function (resolve) {
						// @ts-ignore
						resolve(_this.agent.createConnection(options, cb));
					});
				}
			}

			if (!promise) {
				promise = new Promise(function (resolve) {
					let socket: net.Socket
					if (options.secureEndpoint) {
						socket = tls.connect(options as tls.ConnectionOptions);
					}
					else {
						socket = net.connect(options as net.NetConnectOpts);
					}
					resolve(socket);
				});
			}
		}

		if (promise) {
			promise
				.then(function (socket: _stream.Duplex) {
					if (!cached) {
						cached = true;
						createCache(socket, cacheFile);
					}
					if (!cb_send && cb) {
						cb(null, socket);
						cb_send = true;
					}
				})
				.catch(function (err: Error) {
					if (!cb_send && cb) {
						cb(err, null);
						cb_send = true;
					}
				});
		}

		return promise;
	}/**/
}

class HTTPCacheAgent extends ComlogCacheAgent {
	constructor(opt?: CAOptions, agent?: _http.Agent|_https.Agent|Agent) {
		if (!opt) opt = {} as CAOptions;
		opt.secureEndpoint = false;
		super(opt, agent);
	}
}

class HTTPSCacheAgent extends ComlogCacheAgent {
	constructor(opt?: CAOptions, agent?: _http.Agent|_https.Agent|Agent) {
		if (!opt) opt = {} as CAOptions;
		opt.secureEndpoint = true;
		super(opt, agent);
	}
}

class Init {
	private filepath: string = _os.tmpdir();
	private prefix = 'node_ca_';

	constructor() {
		//this.filepath = _os.tmpdir();
		//this.prefix = 'node_ca_';

		try {
			if (!_fs.statSync(this.filepath).isDirectory()) {
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
				var p = check.shift() as string;
				try {
					if (_fs.statSync(p).isDirectory()) {
						this.filepath = p;
						break;
					}
				} catch (e) {}
			}
		}
	}


	/**
	 * @param {*} [opt]
	 * @constructor
	 */
	private _opt (opt: any) {
		if (!opt) opt = {};
		opt.filepath = opt.filepath || this.filepath;
		opt.prefix = (typeof opt.prefix !== "string") ? this.prefix : opt.prefix;
		return opt;
	}

	/**
	 *
	 * @param {{path:string, prefix:string}|null} [opt] Other options in https://nodejs.org/api/http.html#new-agentoptions
	 * @param {module:http.Agent} [agent]
	 * @return {Agent}
	 */
	http (opt?: CAOptions, agent?: _http.Agent | Agent) {
		opt = this._opt(opt);
		return new HTTPCacheAgent(opt, agent);
	}

	/**
	 *
	 * @param {{}} [opt]
	 * @param {module:http.Agent} [agent]
	 * @return {Agent}
	 */
	https (opt?: CAOptions, agent?: _https.Agent | Agent) {
		opt = this._opt(opt);
		return new HTTPSCacheAgent(opt, agent);
	}

	/**
	 * Create HTTP or HTTPS Cache agent. Autodetect!
	 * @param {{}} [opt]
	 * @param {module:http.Agent} [agent]
	 * @return {Agent}
	 */
	auto (opt?: CAOptions, agent?: _http.Agent | _https.Agent | Agent) {
		opt = this._opt(opt);
		return new ComlogCacheAgent(opt, agent);
	}

	getCacheFiles (opt: any, cb?: Function) {
		opt = this._opt(opt);
		var pcheck : Function;
		if (opt.prefix !== '') pcheck = function (file : string) { return file.indexOf(opt.prefix) === 0; };
		else pcheck = function () { return true; };

		var scheck = function (file : string) {
			return file.indexOf('.cache') === file.length-6;
		};

		_fs.readdir(opt.filepath, function (err, files) {
			if (err) {
				if (cb) cb(err, null);
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
	}

	cleanup (opt: any|Function, cb?: Function) {
		if (typeof opt == "function" && !cb) {
			cb = opt;
			opt = null;
		}

		opt = this._opt(opt);

		this.getCacheFiles(opt, function (err: null|Error, files: null|[string]) {
			if (err) {
				if (cb) cb(err);
				return;
			}

			if (files) for (var i=0; i < files.length;i++) {
				var fp = _path.normalize(opt.filepath + _path.sep + files[i]);
				try {
					var head = readCacheHeaderSync(fp);
					var HeadObj = parseHead(head);
					if (HeadObj.expires) {
						let expires = new Date(HeadObj.expires);
						if ((new Date()).getTime() > expires.getTime()) {
							_fs.unlinkSync(fp);
						}
					}
					else {
						_fs.unlinkSync(fp);
					}
				} catch (e) {
					if (!err) { // @ts-ignore
						err = e;
					}
					else { // @ts-ignore
						err.message += "\n"+e.message;
					}
				}
			}

			if (cb) cb(err);
		});
	}

	reset (opt: any|Function, cb?: Function) {
		if (typeof opt == "function" && !cb) {
			cb = opt;
			opt = null;
		}

		opt = this._opt(opt);

		var errors: Error[] = [];
		this.getCacheFiles(opt, function (err: Error|null, files: string[]) {
			if (err) {
				errors.push(err);
				if (cb) cb(errors.length > 0 ? errors : null);
				return;
			}

			var _queuHanldle = function (index: number, qcb: Function) {
				if (index < files.length) {
					var file = files[index];
					var fp = _path.normalize(opt.filepath + _path.sep + file);
					var fpc = fp + '.tmp';
					var rstream = _fs.createReadStream(fp);
					var wstream : _fs.WriteStream | null = null;

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
							wstream.write('Expires: ' + (new Date(1970, 0, 1, 1, 0, 0)).toUTCString());

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
							wstream = null;
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
