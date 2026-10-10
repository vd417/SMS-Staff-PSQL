import type { ChatRepository } from '@/data/repositories/types';
import type { HttpClient } from '@/lib/httpClient';
import type { ChatContact } from '@/data/domain';
import { toChatThread, toChatMessage, toChatContact } from './mappers';
import { parseWire } from './schemas/wire';
import { chatThreadListSchema, chatThreadSchema, chatMessageListSchema, chatMessageSchema, chatContactListSchema } from './schemas/features.schema';

// Reuses the shared /v1/threads chat engine. Staff can list threads, start a chat with a management
// contact (principal/owner/admin/vice), read, and reply.
export function httpChat(http: HttpClient): ChatRepository {
  return {
    threads: () =>
      http.get('/threads').then((d) => parseWire(chatThreadListSchema, d, 'chat threads').map(toChatThread)),
    contacts: () =>
      http.get('/threads/contacts').then((d) => parseWire(chatContactListSchema, d, 'chat contacts').map(toChatContact)),
    createThread: (c: ChatContact) =>
      http
        .post('/threads', { name: c.name, role: c.role || null, group: false, child_id: null, contact_kind: c.kind, contact_id: c.id })
        .then((d) => toChatThread(parseWire(chatThreadSchema, d, 'chat thread'))),
    messages: (threadId: string) =>
      http.get(`/threads/${threadId}/messages`).then((d) => parseWire(chatMessageListSchema, d, 'chat messages').map(toChatMessage)),
    send: (threadId: string, text: string) =>
      http
        .post(`/threads/${threadId}/messages`, { text: text.trim() || null, image_url: null })
        .then((d) => toChatMessage(parseWire(chatMessageSchema, d, 'chat message'))),
  };
}
