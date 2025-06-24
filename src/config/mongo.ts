const DB_URL = process.env.MONGO_URI;

import mongoose from 'mongoose';
import loadModels from '../models';

// async function run() {
//   // 4. Connect to MongoDB
//   await mongoose.connect(DB_URL);

// }

export default () => {
  const connect = () => {
    mongoose.Promise = global.Promise;
    mongoose
      .connect(DB_URL)
      .then(() => {
        let dbStatus = '';
        dbStatus = `*    DB Connection: OK\n****************************\n`;
        if (process.env.NODE_ENV !== 'test') {
          // Prints initialization
          console.log('****************************');
          console.log('*    Starting Server');
          console.log(`*    Port: ${process.env.PORT || 3000}`);
          console.log(`*    NODE_ENV: ${process.env.NODE_ENV}`);
          console.log(`*    Database: MongoDB`);
          console.log(dbStatus);
        }
      })
      .catch((err) => {
        console.log(
          `*    Error connecting to DB: ${err}\n****************************\n`,
        );
      });
  };
  connect();

  mongoose.connection.on('error', console.log);
  mongoose.connection.on('disconnected', connect);

  loadModels();
};
