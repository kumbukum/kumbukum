import config from '../config.js';

const PROVIDERS = {
	openai: {
		baseUrl: 'https://api.openai.com/v1',
		defaultModel: 'gpt-4o',
	},
	google: {
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
		defaultModel: 'gemini-2.0-flash',
	},
	groq: {
		baseUrl: 'https://api.groq.com/openai/v1',
		defaultModel: 'llama-3.3-70b-versatile',
	},
	cerebras: {
		baseUrl: 'https://api.cerebras.ai/v1',
		defaultModel: 'llama-3.3-70b',
	},
};

/**
* Chat completion — returns streaming response or full text.
*/
export async function chatCompletion({ messages, stream = false }) {
	const provider = PROVIDERS[config.llm.provider];
	if (!provider) throw new Error(`Unknown LLM provider: ${config.llm.provider}`);
	if (!config.llm.apiKey) throw new Error('LLM_API_KEY not configured');

	const model = config.llm.model || provider.defaultModel;

	// Google Gemini uses a different API format
	if (config.llm.provider === 'google') {
		return googleChat({ messages, model, stream });
	}

	// OpenAI-compatible API (OpenAI, Groq, Cerebras)
	const response = await fetch(`${provider.baseUrl}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.llm.apiKey}`,
		},
		body: JSON.stringify({
			model,
			messages,
			stream,
			max_tokens: 4096,
		}),
	});

	if (!response.ok) {
		const err = await response.text();
		throw new Error(`LLM API error (${response.status}): ${err}`);
	}

	if (stream) return response.body;

	const data = await response.json();
	return data.choices[0].message.content;
}

async function googleChat({ messages, model, stream }) {
	// Convert OpenAI format to Gemini format
	const contents = messages
		.filter((m) => m.role !== 'system')
		.map((m) => ({
			role: m.role === 'assistant' ? 'model' : 'user',
			parts: [{ text: m.content }],
		}));

	const systemInstruction = messages.find((m) => m.role === 'system');

	const endpoint = stream ? 'streamGenerateContent' : 'generateContent';
	const url = `${PROVIDERS.google.baseUrl}/models/${model}:${endpoint}?key=${config.llm.apiKey}`;

	const body = { contents };
	if (systemInstruction) {
		body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
	}

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const err = await response.text();
		throw new Error(`Gemini API error (${response.status}): ${err}`);
	}

	if (stream) return response.body;

	const data = await response.json();
	return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
