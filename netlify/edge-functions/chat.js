import { handleChat } from '../shared/chat-core.js';

// AI_API_KEY / AI_BASE_URL / AI_MODEL configure an OpenAI-compatible provider.
// Set AI_PROVIDER=anthropic (with ANTHROPIC_API_KEY) to use the Anthropic API instead.
export default (request) => {
  const env = (name) => Netlify.env.get(name);
  const anthropic = env('AI_PROVIDER') === 'anthropic';
  return handleChat(request, {
    provider: anthropic ? 'anthropic' : 'openai',
    apiKey: anthropic ? env('ANTHROPIC_API_KEY') : env('AI_API_KEY'),
    baseUrl: env('AI_BASE_URL'),
    model: env('AI_MODEL'),
  });
};

export const config = { path: '/api/chat' };
