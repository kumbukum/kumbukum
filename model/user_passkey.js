import mongoose from 'mongoose';

const passkeySchema = new mongoose.Schema(
	{
		user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
		credential_id: { type: String, required: true, unique: true },
		public_key: { type: Buffer, required: true },
		counter: { type: Number, default: 0 },
		device_type: { type: String },
		backed_up: { type: Boolean, default: false },
		transports: [{ type: String }],
		name: { type: String, default: 'Passkey' },
	},
	{ timestamps: true },
);

export const UserPasskey = mongoose.model('UserPasskey', passkeySchema);
