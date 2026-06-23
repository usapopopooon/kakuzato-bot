import { access } from "node:fs/promises";

const healthcheckFile = process.env.HEALTHCHECK_FILE ?? "/tmp/kakuzato-bot-ready";

access(healthcheckFile).catch(() => {
  process.exitCode = 1;
});
