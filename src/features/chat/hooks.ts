import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepositories } from '@/data/repositories/RepositoryContext';
import { queryKeys } from '@/lib/queryClient';

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
