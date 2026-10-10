import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepositories } from '@/data/repositories/RepositoryContext';
import { queryKeys } from '@/lib/queryClient';
import type { ChatContact } from '@/data/domain';

// No SignalR in the staff app — keep chat fresh by polling while a screen is open.
const THREADS_POLL_MS = 15_000;
const MESSAGES_POLL_MS = 10_000;

export function useChatThreads() {
  const repos = useRepositories();
  return useQuery({
    queryKey: queryKeys.chatThreads(),
    queryFn: () => repos.chat.threads(),
    refetchInterval: THREADS_POLL_MS,
  });
}

/** Total unread messages across all chat threads — for the Inbox tab badge. */
export function useChatUnread(): number {
  const q = useChatThreads();
  return (q.data ?? []).reduce((n, t) => n + (t.unread > 0 ? t.unread : 0), 0);
}

/** Management contacts a staff member can start a chat with. */
export function useChatContacts() {
  const repos = useRepositories();
  return useQuery({
    queryKey: queryKeys.chatContacts(),
    queryFn: () => repos.chat.contacts(),
  });
}

/** Open (or reuse) a thread with a contact, then refresh the thread list. */
export function useCreateThread() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contact: ChatContact) => repos.chat.createThread(contact),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.chatThreads() }),
  });
}

export function useChatMessages(threadId?: string) {
  const repos = useRepositories();
  return useQuery({
    queryKey: queryKeys.chatMessages(threadId ?? ''),
    queryFn: () => repos.chat.messages(threadId!),
    enabled: !!threadId,
    refetchInterval: MESSAGES_POLL_MS,
  });
}

export function useSendMessage(threadId: string) {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => repos.chat.send(threadId, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.chatMessages(threadId) });
      qc.invalidateQueries({ queryKey: queryKeys.chatThreads() });
    },
  });
}
