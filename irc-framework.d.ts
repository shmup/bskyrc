// type definitions for irc-framework
declare module "irc-framework" {
	export interface ConnectionOptions {
		host?: string;
		port?: number;
		nick?: string;
		username?: string;
		gecos?: string;
		tls?: boolean;
	}

	export interface JoinEvent {
		nick: string;
		channel: string;
	}

	export interface MessageEvent {
		nick: string;
		message: string;
		target: string;
	}

	export interface User {
		nick: string;
	}

	export class Client {
		user: User;
		connect(options: ConnectionOptions): void;
		join(channel: string): void;
		say(target: string, message: string): void;
		on(event: "registered", handler: () => void): void;
		on(event: "join", handler: (event: JoinEvent) => void): void;
		on(event: "message", handler: (event: MessageEvent) => void): void;
		on(event: "socket close", handler: () => void): void;
		on(event: "reconnecting", handler: () => void): void;
		on(event: "error", handler: (err: Error) => void): void;
		on(event: "close", handler: (event: unknown) => void): void;
	}
}
