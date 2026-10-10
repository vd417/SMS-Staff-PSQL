import type { ChatRepository } from '@/data/repositories/types';
import type { ChatMessage, ChatContact, ChatThread } from '@/data/domain';
import { simulateLatency } from '@/lib/latency';

// Mock adapter: the staff demo data has no chat threads, so this returns empty lists and echoes
// sent messages back. Real chat is exercised against the live /v1/threads backend.
export function mockChat(): ChatRepository {
  return {
    async threads() {
      await simulateLatency();
      return [];
    },
    async contacts(): Promise<ChatContact[]> {
      await simulateLatency();
      return [];
    },
    async createThread(contact: ChatContact): Promise<ChatThread> {
      await simulateLatency();
      return { id: `t_${Date.now()}`, name: contact.name, role: contact.role, unread: 0 };
    },
    async messages() {
      await simulateLatency();
      return [];
    },
    async send(_threadId: string, text: string): Promise<ChatMessage> {
      await simulateLatency();
      return { id: `m_${Date.now()}`, text, sentAt: new Date().toISOString(), isMine: true };
    },
  };
}
