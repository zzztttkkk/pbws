import { errcodes } from "./gen.ts";
import { Delegate } from "./pkgs/internal/delegate.ts";
import type { FailedResponse } from "./gen.ts";

export const FailedResponseConstructor = Delegate<() => FailedResponse>(import.meta, "FailedResponse");

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

