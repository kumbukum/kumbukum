import mongoose from 'mongoose';
import config from './config.js';

let connection;

export async function connectDB() {
	if (connection) return connection;
	connection = await mongoose.connect(config.mongoUri);
	console.log(`MongoDB connected: ${mongoose.connection.host}`);
	return connection;
}

export default mongoose;
