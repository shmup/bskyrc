// logging utilities with timestamps
export function log(message: string) {
	console.log(`[${new Date().toISOString()}] ${message}`);
}

export function logError(message: string, err?: unknown) {
	if (err) {
		console.error(`[${new Date().toISOString()}] ${message}`, err);
	} else {
		console.error(`[${new Date().toISOString()}] ${message}`);
	}
}
