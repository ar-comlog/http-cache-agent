/// <reference types="node" />
import _http from "http";
import _https from "https";
import net from "net";
import { Agent, ClientRequest, RequestOptions, AgentOptions } from 'agent-base';
import tls from "tls";
export interface Header {
    protocol?: string;
    statusCode?: string;
    statusMessage?: string;
    expires?: string;
}
export interface CAClientRequest extends ClientRequest {
    path: string;
    pathname: string;
}
export interface CAOptions extends AgentOptions, tls.ConnectionOptions {
    filepath?: string;
    prefix?: string;
    secureEndpoint?: boolean;
    agent?: Agent;
}
export declare class ComlogCacheAgent extends Agent {
    agent?: _http.Agent | _https.Agent | Agent;
    filepath: string;
    prefix: string;
    cache: CAOptions;
    secureEndpoint: boolean;
    constructor(opt?: CAOptions, agent?: _http.Agent | _https.Agent | Agent);
    /**
     * Generate cache File path for Request
     * @param {RequestOptions} options
     */
    getCacheFilePath(options: RequestOptions): string;
    /**
     * Called when the node-core HTTP client library is creating a
     * new HTTP request.
     *
     * @api protected
     */
    callback(request: CAClientRequest, options: RequestOptions, cb?: Function): Promise<net.Socket>;
}
export declare class HTTPCacheAgent extends ComlogCacheAgent {
    constructor(opt?: CAOptions, agent?: _http.Agent | _https.Agent | Agent);
}
export declare class HTTPSCacheAgent extends ComlogCacheAgent {
    constructor(opt?: CAOptions, agent?: _http.Agent | _https.Agent | Agent);
}
/**
 * Create HTTP Agent
 * @param {{path:string, prefix:string}|null} [opt] Other options in https://nodejs.org/api/http.html#new-agentoptions
 * @param {module:http.Agent} [agent]
 * @return {Agent}
 */
export declare function http(opt?: CAOptions, agent?: _http.Agent | Agent): HTTPCacheAgent;
/**
 * Create HTTPS Agent
 * @param {{}} [opt]
 * @param {module:http.Agent} [agent]
 * @return {Agent}
 */
export declare function https(opt?: CAOptions, agent?: _https.Agent | Agent): HTTPSCacheAgent;
/**
 * Create HTTP or HTTPS Cache agent. Autodetect!
 * @param {{}} [opt]
 * @param {module:http.Agent} [agent]
 * @return {Agent}
 */
export declare function auto(opt?: CAOptions, agent?: _http.Agent | _https.Agent | Agent): ComlogCacheAgent;
export declare function getCacheFiles(opt: any, cb?: Function): void;
export declare function cleanup(opt: any | Function, cb?: Function): void;
/**
 * Reset cache Timestamp
 * @param {opt: Object|Function} opt Options or callback function
 * @param {Function} [cb] Callback function
 */
export declare function reset(opt: any | Function, cb?: Function): void;
export declare function clear(opt: any | Function, cb?: Function): void;
