type LogFunction = (message: any) => void;

export interface ILogger {
	warn: LogFunction;
	error: LogFunction;
	info: LogFunction;
	log: LogFunction;
}
