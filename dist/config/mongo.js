"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const DB_URL = process.env.MONGO_URI;
const mongoose_1 = __importDefault(require("mongoose"));
const models_1 = __importDefault(require("../models"));
// async function run() {
//   // 4. Connect to MongoDB
//   await mongoose.connect(DB_URL);
// }
exports.default = () => {
    const connect = () => {
        mongoose_1.default.Promise = global.Promise;
        mongoose_1.default
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
            console.log(`*    Error connecting to DB: ${err}\n****************************\n`);
        });
    };
    connect();
    mongoose_1.default.connection.on('error', console.log);
    mongoose_1.default.connection.on('disconnected', connect);
    (0, models_1.default)();
};
//# sourceMappingURL=mongo.js.map