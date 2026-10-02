import { handleChat } from '../shared/chat-core.js';

export default (request) =>
  handleChat(request, {
    apiKey: Netlify.env.get('ANTHROPIC_API_KEY'),
    model: Netlify.env.get('ANTHROPIC_MODEL'),
  });

export const config = { path: '/api/chat' };
