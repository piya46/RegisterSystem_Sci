require('dotenv').config();
const connectDB = require('./config/db');
const app = require('./app');
const initScheduler = require('./cron/reportScheduler');

connectDB().then(() => {
  initScheduler();
  app.listen(process.env.PORT || 3000, () => {
    console.log(`Start Server Running on port ${process.env.PORT}`);
  });
});
