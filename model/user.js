import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
	{
		email: { type: String, required: true, unique: true, lowercase: true, trim: true },
		password: { type: String, required: true, select: false },
		name: { type: String, required: true, trim: true },
		timezone: { type: String, default: 'UTC' },
		tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
		host_id: { type: String, index: true },
		is_active: { type: Boolean, default: false },
		is_verified: { type: Boolean, default: false },
		verification_token: { type: String, select: false },
		// Password reset
		password_reset_token: { type: String, select: false },
		password_reset_expires: { type: Date, select: false },
		// 2FA
		totp_secret: { type: String, select: false },
		totp_enabled: { type: Boolean, default: false },
		// Access tokens for API
		access_tokens: [
			{
				token: { type: String },
				name: { type: String },
				created_at: { type: Date, default: Date.now },
			},
		],
	},
	{ timestamps: true },
);

userSchema.pre('save', async function () {
	if (!this.isModified('password')) return;
	this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (candidate) {
	return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafe = function () {
	const obj = this.toObject();
	delete obj.password;
	delete obj.totp_secret;
	delete obj.verification_token;
	return obj;
};

export const User = mongoose.model('User', userSchema);
