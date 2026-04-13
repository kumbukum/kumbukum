const mcpConfig = {
  port: parseInt(process.env.PORT, 10) || 3002,
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
};

export default mcpConfig;
