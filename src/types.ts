import {Agent, AgentOptions, ClientRequest} from "agent-base";
import tls from "tls";

export interface Header {
	protocol?: string,
	statusCode?: string,
	statusMessage?: string,
	expires?: string
}

export interface CAClientRequest extends ClientRequest {
	path: string;
	pathname: string;
}

export interface CAOptions extends AgentOptions, tls.ConnectionOptions {
	filepath?: string,
	prefix?: string,
	secureEndpoint?: boolean,
	agent?: Agent,
}