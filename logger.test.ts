import { init } from "./logger.ts";

await init({ dir: "./logs", timelayout: "YYYY-MM-DD HH:mm:ss.SSS", rotate: "minutely" });

logger.info("auto flush before shutdown");

while (true) {
    await new Promise(resolve => { setTimeout(resolve, 1000); });
    logger.trace("trace");
    logger.debug("debug");
    logger.info("info");
    logger.warn("warn");
    logger.error("error");
}
