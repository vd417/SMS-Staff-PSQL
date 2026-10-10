import type { ChatRepository } from '@/data/repositories/types';
import type { HttpClient } from '@/lib/httpClient';
import { toChatThread, toChatMessage } from './mappers';
import { parseWire } from './schemas/wire';
import { chatThreadListSchema, chatMessageListSchema, chatMessageSchema } from './schemas/features.schema';

// Reuses the shared /v1/threads chat engine. Staff only read + reply here (no thread creation):
// the office/principal/admin starts the thread from the CRM, and it appears in this list.
export function httpChat(http: HttpClient): ChatRepository {
  return {
    threads: () =>
      http.get('/threads').then((d) => parseWire(chatThreadListSchema, d, 'chat threads').map(toChatThread)),
    messages: (threadId: string) =>
      http.get(`/threads/${threadId}/messages`).then((d) => parseWire(chatMessageListSchema, d, 'chat messages').map(toChatMessage)),
    send: (threadId: string, text: string) =>
      http
        .post(`/threads/${threadId}/messages`, { text: text.trim() || null, image_url: null })
        .then((d) => toChatMessage(parseWire(chatMessageSchema, d, 'chat message'))),
  };
}
