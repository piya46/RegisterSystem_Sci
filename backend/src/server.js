require('dotenv').config();
const connectDB = require('./config/db');
const app = require('./app');

connectDB().then(() => {
  app.listen(process.env.PORT || 3000, () => {
    console.log(`Start Server Running on port ${process.env.PORT}`);
  });
});
