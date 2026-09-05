const linkHealth = require("./linkHealth.cron");
const reverification = require("./reverification.cron");

const startCronJobs = () => {
  linkHealth.schedule();
  reverification.schedule();
  console.log("Cron jobs scheduled");
};

module.exports = startCronJobs;
