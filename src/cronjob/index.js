const linkHealth = require("./linkHealth.cron");
const reverification = require("./reverification.cron");
const cleanup = require("./cleanup.cron");
const logger = require("../utils/logger");

const startCronJobs = () => {
  linkHealth.schedule();
  reverification.schedule();
  cleanup.schedule();
  logger.info("Cron jobs scheduled");
};

module.exports = startCronJobs;
