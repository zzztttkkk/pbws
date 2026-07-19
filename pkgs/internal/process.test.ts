import "./process.ts";

const ac = new AbortController()

const server = Deno.serve(
    {
        signal: ac.signal,
    },
    async () => {
        return new Response("hello world", { status: 200 });
    },
);

process.RegisterBeforeShutdownAction(() => {
    ac.abort();
    console.log("server aborted");
});

console.log(`server started: ${process.pid}`);

await server.finished;
