"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clear = exports.reset = exports.cleanup = exports.getCacheFiles = exports.auto = exports.https = exports.http = exports.HTTPSCacheAgent = exports.HTTPCacheAgent = exports.ComlogCacheAgent = void 0;
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const net_1 = __importDefault(require("net"));
const agent_base_1 = require("agent-base");
const tls_1 = __importDefault(require("tls"));
var filepath = os_1.default.tmpdir();
var prefix = 'node_ca_';
var file_end = '--------------------http-cache-agent';
function getKey(options) {
    // @ts-ignore
    let href = options.href || null;
    if (!href) {
        href = '';
        if (!options.protocol) {
            if (options.port === 443)
                options.protocol = 'https:';
            else
                options.protocol = 'http:';
        }
        href += options.protocol + '//';
        if (options.auth)
            href += options.auth + '@';
        href += options.host;
        if (options.port) {
            if ((href.indexOf('http:') > -1 && options.port !== 80) ||
                (href.indexOf('https:') > -1 && options.port !== 443) ||
                (href.indexOf('http:') < 0 && href.indexOf('https:') < 0)) {
                href += ':' + options.port;
            }
        }
        // @ts-ignore
        href += options.pathname || options.path || '/';
        // @ts-ignore
        if (options.query)
            href += '?' + options.query;
        // @ts-ignore
        else if (options.search)
            options.href += options.search;
    }
    var data = [href];
    if (options.method)
        data.push(options.method);
    if (options.protocol)
        data.push(options.protocol);
    if (options.headers)
        data.push(JSON.stringify(options.headers));
    var md5sum = crypto_1.default.createHash('md5');
    md5sum.update(data.join('|'));
    return md5sum.digest('hex');
}
function readCacheHeaderSync(file) {
    let fd = fs_1.default.openSync(file, 'r');
    let data = Buffer.alloc(1024);
    let offset = 0;
    var spos = -1;
    var head = '';
    var bytes = 0;
    do {
        bytes = fs_1.default.readSync(fd, data, offset, 1024, 0);
        if ((spos = data.indexOf("\r\n\r\n")) > -1) {
            head += data.slice(0, spos);
        }
        else {
            head += data.slice(0, spos);
        }
        offset = offset + 1024;
    } while (spos === -1 && bytes > 0);
    fs_1.default.closeSync(fd);
    return head;
}
function parseHead(head) {
    var res = {};
    var lines = head.split("\r\n");
    var tmp;
    for (var i = 0; i < lines.length; i++) {
        if (lines[i] === '')
            continue;
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
function createCache(socket, file) {
    let cache_fd;
    let head = Buffer.alloc(0);
    let spos = -1;
    let tmp_file = path_1.default.normalize(path_1.default.dirname(file) + path_1.default.sep + '~' + path_1.default.basename(file));
    socket.on('data', function (data) {
        if (head !== null) {
            head = Buffer.concat([head, data], head.length + data.length);
            if ((spos = head.indexOf("\r\n\r\n")) > -1) {
                var body = head.slice(spos + 4, head.length);
                head = head.slice(0, spos + 4);
                var HeadObj = parseHead(head.toString());
                if (HeadObj.expires) {
                    let expires = new Date(HeadObj.expires);
                    if ((new Date()).getTime() < expires.getTime()) {
                        try {
                            cache_fd = fs_1.default.openSync(tmp_file, 'w+');
                        }
                        catch (e) {
                            socket.emit('http-cache-agent.error', e);
                        }
                    }
                }
                if (cache_fd) {
                    fs_1.default.writeSync(cache_fd, head);
                    fs_1.default.writeSync(cache_fd, body);
                }
                head = null;
            }
        }
        else {
            if (cache_fd)
                fs_1.default.writeSync(cache_fd, data);
        }
    });
    socket.on('end', function () {
        if (cache_fd) {
            try {
                fs_1.default.closeSync(cache_fd);
                if (fs_1.default.existsSync(file))
                    fs_1.default.unlinkSync(file);
                fs_1.default.renameSync(tmp_file, file);
            }
            catch (e) {
                socket.emit('http-cache-agent.error', e);
            }
        }
    });
}
function isCached(file) {
    try {
        if (fs_1.default.existsSync(file)) {
            var head = readCacheHeaderSync(file);
            var HeadObj = parseHead(head);
            if (HeadObj.expires) {
                let expires = new Date(HeadObj.expires);
                if ((new Date()).getTime() < expires.getTime()) {
                    return true;
                }
            }
        }
    }
    catch (e) { }
    return false;
}
/**
 *
 * @param {string} file
 * @param {Function} cb
 * @return {module:net.Socket}
 */
function CacheSocket(file, cb) {
    var stream = fs_1.default.createReadStream(file);
    var PIPE_NAME = Date.now().toString(36);
    var PIPE_PATH = "\\\\.\\pipe\\" + PIPE_NAME;
    var srv = net_1.default.createServer(function (sock) {
        sock.on('data', function (chunk) {
            stream.pipe(sock);
            stream.on('end', function () {
                sock.end();
                srv.close();
                if (stream)
                    stream.close();
            });
        });
    });
    var socket = new net_1.default.Socket();
    srv.listen(PIPE_PATH, function () {
        // @ts-ignore
        socket.connect(PIPE_PATH);
        cb(socket);
    });
    return socket;
}
class ComlogCacheAgent extends agent_base_1.Agent {
    constructor(opt, agent) {
        super(opt);
        this.filepath = os_1.default.tmpdir();
        this.prefix = 'node_ca_';
        this.secureEndpoint = false;
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
            this.cache = Object.assign({}, opt);
        }
        else
            this.cache = {};
    }
    /**
     * Generate cache File path for Request
     * @param {RequestOptions} options
     */
    getCacheFilePath(options) {
        var key = getKey(options);
        return path_1.default.normalize(this.filepath + path_1.default.sep + this.prefix + key) + '.cache';
    }
    /**
     * Called when the node-core HTTP client library is creating a
     * new HTTP request.
     *
     * @api protected
     */
    callback(request, options, cb) {
        return __awaiter(this, void 0, void 0, function* () {
            var _this = this;
            var promise = null;
            var cacheFile = this.getCacheFilePath(options);
            var cached = false;
            var cb_send = false;
            //console.info('Cache: ',cacheFile);
            if (isCached(cacheFile)) {
                cached = true;
                promise = new Promise(function (resolve, reject) {
                    CacheSocket(cacheFile, function (socket) {
                        socket.on('connect', function () {
                            resolve(socket);
                        });
                        socket.on('error', function (err) {
                            reject(err);
                        });
                    }); /**/
                });
            }
            // Create default request socket
            if (!promise) {
                options = Object.assign(options, _this.cache);
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
                        let socket;
                        if (options.secureEndpoint) {
                            socket = tls_1.default.connect(options);
                        }
                        else {
                            socket = net_1.default.connect(options);
                        }
                        resolve(socket);
                    });
                }
            }
            if (promise) {
                promise
                    .then(function (socket) {
                    if (!cached) {
                        cached = true;
                        socket.on('http-cache-agent.error', function (e) {
                            request.emit('http-cache-agent.error', e);
                        });
                        createCache(socket, cacheFile);
                    }
                    if (!cb_send && cb) {
                        cb(null, socket);
                        cb_send = true;
                    }
                })
                    .catch(function (err) {
                    if (!cb_send && cb) {
                        cb(err, null);
                        cb_send = true;
                    }
                });
            }
            return promise;
        });
    } /**/
}
exports.ComlogCacheAgent = ComlogCacheAgent;
class HTTPCacheAgent extends ComlogCacheAgent {
    constructor(opt, agent) {
        if (!opt)
            opt = {};
        opt.secureEndpoint = false;
        super(opt, agent);
    }
}
exports.HTTPCacheAgent = HTTPCacheAgent;
class HTTPSCacheAgent extends ComlogCacheAgent {
    constructor(opt, agent) {
        if (!opt)
            opt = {};
        opt.secureEndpoint = true;
        super(opt, agent);
    }
}
exports.HTTPSCacheAgent = HTTPSCacheAgent;
/**
 * @param {*} [opt]
 * @constructor
 */
function _opt(opt) {
    if (!opt || typeof opt !== 'object')
        opt = {};
    opt.filepath = opt.filepath || filepath;
    opt.prefix = (typeof opt.prefix !== "string") ? prefix : opt.prefix;
    return opt;
}
/**
 * Create HTTP Agent
 * @param {{path:string, prefix:string}|null} [opt] Other options in https://nodejs.org/api/http.html#new-agentoptions
 * @param {module:http.Agent} [agent]
 * @return {Agent}
 */
function http(opt, agent) {
    opt = _opt(opt);
    return new HTTPCacheAgent(opt, agent);
}
exports.http = http;
/**
 * Create HTTPS Agent
 * @param {{}} [opt]
 * @param {module:http.Agent} [agent]
 * @return {Agent}
 */
function https(opt, agent) {
    opt = _opt(opt);
    return new HTTPSCacheAgent(opt, agent);
}
exports.https = https;
/**
 * Create HTTP or HTTPS Cache agent. Autodetect!
 * @param {{}} [opt]
 * @param {module:http.Agent} [agent]
 * @return {Agent}
 */
function auto(opt, agent) {
    opt = _opt(opt);
    return new ComlogCacheAgent(opt, agent);
}
exports.auto = auto;
function getCacheFiles(opt, cb) {
    opt = _opt(opt);
    var pcheck;
    if (opt.prefix !== '')
        pcheck = function (file) { return file.indexOf(opt.prefix) === 0; };
    else
        pcheck = function () { return true; };
    var scheck = function (file) {
        let ext_ok = file.indexOf('.cache') === file.length - 6;
        let prefix_ok = true;
        if (prefix && prefix.length > 0) {
            if (file.indexOf('~') === 0) {
                prefix_ok = file.substring(0, prefix.length + 1) === '~' + prefix;
            }
            else {
                prefix_ok = file.substring(0, prefix.length) === prefix;
            }
        }
        return ext_ok && prefix_ok;
    };
    fs_1.default.readdir(opt.filepath, function (err, files) {
        if (err) {
            if (cb)
                cb(err, null);
            return;
        }
        var result = [];
        for (var i = 0; i < files.length; i++) {
            if (pcheck(files[i]) && scheck(files[i])) {
                result.push(files[i]);
            }
        }
        if (cb)
            cb(null, result);
    });
}
exports.getCacheFiles = getCacheFiles;
function cleanup(opt, cb) {
    if (typeof opt == "function" && !cb) {
        cb = opt;
        opt = null;
    }
    opt = _opt(opt);
    getCacheFiles(opt, function (err, files) {
        if (err) {
            if (cb)
                cb(err);
            return;
        }
        if (files)
            for (var i = 0; i < files.length; i++) {
                var fp = path_1.default.normalize(opt.filepath + path_1.default.sep + files[i]);
                try {
                    var head = readCacheHeaderSync(fp);
                    var HeadObj = parseHead(head);
                    if (HeadObj.expires) {
                        let expires = new Date(HeadObj.expires);
                        if ((new Date()).getTime() > expires.getTime()) {
                            fs_1.default.unlinkSync(fp);
                        }
                    }
                    else {
                        fs_1.default.unlinkSync(fp);
                    }
                }
                catch (e) {
                    if (!err) { // @ts-ignore
                        err = e;
                    }
                    else { // @ts-ignore
                        err.message += "\n" + e.message;
                    }
                }
            }
        if (cb)
            cb(err);
    });
}
exports.cleanup = cleanup;
/**
 * Reset cache Timestamp
 * @param {opt: Object|Function} opt Options or callback function
 * @param {Function} [cb] Callback function
 */
function reset(opt, cb) {
    if (typeof opt == "function" && !cb) {
        cb = opt;
        opt = null;
    }
    opt = _opt(opt);
    var errors = [];
    getCacheFiles(opt, function (err, files) {
        if (err) {
            errors.push(err);
            if (cb)
                cb(errors.length > 0 ? errors : null);
            return;
        }
        var _queuHanldle = function (index, qcb) {
            if (index < files.length) {
                var file = files[index];
                var fp = path_1.default.normalize(opt.filepath + path_1.default.sep + file);
                var fpc = fp + '.tmp';
                var rstream = fs_1.default.createReadStream(fp);
                var wstream = null;
                rstream.on('data', function (chunk) {
                    if (!wstream) {
                        wstream = fs_1.default.createWriteStream(fpc);
                        wstream.on('error', function (err) {
                            errors.push(err);
                            rstream.close();
                        });
                    }
                    var begin = chunk.indexOf('Expires:');
                    if (begin > -1) {
                        wstream.write(chunk.slice(0, begin));
                        wstream.write('Expires: ' + (new Date(1970, 0, 1, 1, 0, 0)).toUTCString());
                        var end = chunk.indexOf("\r\n", begin);
                        if (end > -1) {
                            wstream.write(chunk.slice(end));
                        }
                    }
                    else {
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
                        fs_1.default.unlink(fp, function (err) {
                            if (err) {
                                errors.push(err);
                                fs_1.default.unlink(fpc, function (err) {
                                    if (err)
                                        errors.push(err);
                                    _queuHanldle(index + 1, qcb);
                                });
                                return;
                            }
                            fs_1.default.rename(fpc, fp, function (err) {
                                if (err)
                                    errors.push(err);
                                _queuHanldle(index + 1, qcb);
                            });
                        });
                        return;
                    }
                    _queuHanldle(index + 1, qcb);
                });
            }
            else
                qcb();
        };
        _queuHanldle(0, function () {
            if (cb)
                cb(errors.length > 0 ? errors : null);
        });
    });
}
exports.reset = reset;
function clear(opt, cb) {
    if (typeof opt == "function" && !cb) {
        cb = opt;
        opt = null;
    }
    opt = _opt(opt);
    getCacheFiles(opt, function (err, files) {
        if (err) {
            if (cb)
                cb(err);
            return;
        }
        if (files) {
            let _del = function (index) {
                if (index < files.length) {
                    var fp = path_1.default.normalize(opt.filepath + path_1.default.sep + files[index]);
                    fs_1.default.unlink(fp, function () {
                        _del(index + 1);
                    });
                }
                else {
                    if (cb)
                        cb(null, files);
                }
            };
            _del(0);
            return;
        }
        if (cb)
            cb(null, files);
    });
}
exports.clear = clear;
// init
try {
    if (!fs_1.default.statSync(filepath).isDirectory()) {
        throw new Error('No temp folder found');
    }
}
catch (e) {
    var check = [
        path_1.default.dirname(__filename) + path_1.default.sep + 'temp',
        path_1.default.dirname(path_1.default.dirname(__filename)) + path_1.default.sep + 'temp',
        path_1.default.dirname(path_1.default.dirname(path_1.default.dirname(__filename))) + path_1.default.sep + 'temp',
        path_1.default.dirname(path_1.default.dirname(path_1.default.dirname(path_1.default.dirname(__filename)))) + path_1.default.sep + 'temp'
    ];
    while (check.length > 0) {
        var p = check.shift();
        try {
            if (fs_1.default.statSync(p).isDirectory()) {
                filepath = p;
                break;
            }
        }
        catch (e) { }
    }
}
//# sourceMappingURL=http-cache-agent.js.map