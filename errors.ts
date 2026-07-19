import { field, msg } from "./gen.ts";

export class AppError extends Error {
    code: number;
    meta?: string;

    constructor(code: number, message?: string, exts?: any) {
        super(message);
        this.code = code;
        this.meta = exts === undefined ? undefined : (typeof exts === "string" ? exts : JSON.stringify(exts));
    }

    toresp() {
        const resp = new FailedResponse;
        resp.code = this.code;
        resp.message = this.message;
        resp.meta = this.meta;
        return resp;
    }
}

@msg({ kind: "response" })
export class FailedResponse {
    @field()
    code!: number;

    @field({ nullable: true })
    message?: string;

    @field({ nullable: true, description: "In most cases, this is a json" })
    meta?: string;
}

FailedResponse;


export enum ErrorCode {
    AuthFailed = 1,

    MsgIdNotFound = 200,
    MsgDecodeFailed = 201,

    InvalidParam = 300,

    InternalError = 400,
}