const linkHealth = require("./linkHealth.cron");
const reverification = require("./reverification.cron");
const cleanup = require("./cleanup.cron");
const scholarshipReminder = require("./scholarshipReminder.cron");
const logger = require("../utils/logger");

const startCronJobs = () => {
  linkHealth.schedule();
  reverification.schedule();
  cleanup.schedule();
  scholarshipReminder.schedule();
  logger.info("Cron jobs scheduled");
};

module.exports = startCronJobs;
