import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { assertEquals } from "@std/assert/equals";

const _zip = promisify(zlib.gzip);

const zip_out_opts: zlib.ZlibOptions = { level: 4, };
const unzip_in_opts: zlib.ZlibOptions = { maxOutputLength: 1024 * 1024 * 16 };

export async function zip(data: Buffer) { return _zip(data, zip_out_opts); }

const _unzip = promisify(zlib.unzip);

export async function unzip(data: Buffer) { return _unzip(data, unzip_in_opts); }

Deno.test("zip", async () => {
    const data = Buffer.from("hello world".repeat(1024));
    const zipped = await zip(data);
    const unzipped = await unzip(zipped);
    assertEquals(unzipped, data);
    console.log(zipped.length, data.length);
});
