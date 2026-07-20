import { FailedResponseConstructor } from "./internal.ts";

export class AppError extends Error {
    code: number;
    meta?: string;

    constructor(code: number, message?: string, exts?: any) {
        super(message);
        this.code = code;
        this.meta = exts === undefined ? undefined : (typeof exts === "string" ? exts : JSON.stringify(exts));
    }

    toresp() {
        const resp = FailedResponseConstructor.fn();
        resp.code = this.code;
        resp.message = this.message;
        resp.meta = this.meta;
        return resp;
    }
}

export enum ErrorCode {
    None = 0,
    AuthFailed = 1,

    MsgIdNotFound = 200,
    MsgDecodeFailed = 201,

    InvalidParam = 300,

    InternalError = 400,
}

