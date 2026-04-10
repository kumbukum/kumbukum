function parseTypesenseNodes() {
	const nodesEnv = process.env.TYPESENSE_NODES || '';
	if (nodesEnv) {
		try {
			return JSON.parse(nodesEnv);
		} catch {
			console.warn('Invalid TYPESENSE_NODES JSON, falling back to single-node config');
		}
	}
	return [
		{
			host: process.env.TYPESENSE_HOST || 'localhost',
			port: parseInt(process.env.TYPESENSE_PORT, 10) || 8108,
			protocol: process.env.TYPESENSE_PROTOCOL || 'http',
		},
	];
}

const config = {
	env: process.env.NODE_ENV || 'development',
	port: parseInt(process.env.PORT, 10) || 3000,
	mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/kumbukum?replicaSet=rs0',
	redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
	socketRedis: process.env.SOCKET_REDIS === 'true',
	sessionSecret: process.env.SESSION_SECRET || 'change-me',
	jwtSecret: process.env.JWT_SECRET || 'change-me',
	appUrl: process.env.APP_URL || 'http://localhost:3000',

	typesense: {
		nodes: parseTypesenseNodes(),
		apiKey: process.env.TYPESENSE_API_KEY || 'kumbukum-dev-key',
	},

	smtp: {
		host: process.env.SMTP_HOST || '',
		port: parseInt(process.env.SMTP_PORT, 10) || 587,
		user: process.env.SMTP_USER || '',
		pass: process.env.SMTP_PASS || '',
		from: process.env.SMTP_FROM || 'noreply@localhost',
	},

	llm: {
		provider: process.env.LLM_PROVIDER || 'openai',
		apiKey: process.env.LLM_API_KEY || '',
		model: process.env.LLM_MODEL || '',
	},
};

export default config;
