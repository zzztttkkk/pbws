import { init } from "./logger.ts";

init({ dir: "./logs" });

logger.info("auto flush before shutdown");

await new Promise(() => { });
