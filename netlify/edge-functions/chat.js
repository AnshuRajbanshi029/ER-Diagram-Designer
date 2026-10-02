import { handleChat } from '../shared/chat-core.js';

// Secrets come from Netlify environment variables and never reach the browser:
//   AI_API_KEY, AI_BASE_URL, optional AI_MODEL.
// Set AI_PROVIDER=anthropic (with ANTHROPIC_API_KEY) to use the Anthropic API instead.
export default (request, context) => {
  const env = (name) => Netlify.env.get(name);
  const anthropic = env('AI_PROVIDER') === 'anthropic';
  return handleChat(request, {
    provider: anthropic ? 'anthropic' : 'openai',
    apiKey: anthropic ? env('ANTHROPIC_API_KEY') : env('AI_API_KEY'),
    baseUrl: env('AI_BASE_URL'),
    model: env('AI_MODEL'),
    clientIp: context.ip,
  });
};

export const config = {
  path: '/api/chat',
  // Platform-level limit: 5 requests per minute per client IP, enforced before this code runs.
  rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
