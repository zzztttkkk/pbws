export enum Level {
	Trace = 0,
	Debug = 1,
	Info = 2,
	Warn = 3,
	Error = 4,
}

export interface Item {
	at: number;
	level: Level;
	msg: string;
	args: any[];
	meta?: { [k: string]: any };
}
