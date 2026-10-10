import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { Card, Btn, Pill, Skeleton, IconBtn } from '@/components/ui';
import { ErrorState } from '@/components/state';
import { TextScale } from '@/theme/typography';
import { useChatThreads, useChatMessages, useSendMessage } from '@/features/chat/hooks';
import type { ChatThread } from '@/data/domain';

const formatTime = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export interface MessagesScreenProps {
  navigation: { goBack: () => void };
}

export const MessagesScreen: React.FC<MessagesScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors, role } = useTheme();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<ChatThread | null>(null);

  const title = active ? active.name : t('chat.title');
  const onBack = () => (active ? setActive(null) : navigation.goBack());

  return (
    <SafeAreaView testID="messages-screen" style={[styles.fill, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <IconBtn testID="chat-back" icon="back" label={t('common.back')} onPress={onBack} />
        <Text style={[TextScale.screenTitle, { color: colors.ink }]} numberOfLines={1}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      {active ? (
        <Conversation thread={active} insets={insets} />
      ) : (
        <ThreadList onOpen={setActive} insets={insets} />
      )}
    </SafeAreaView>
  );

  function ThreadList({ onOpen }: { onOpen: (t: ChatThread) => void; insets: typeof insets }) {
    const { data, isLoading, isError, refetch } = useChatThreads();
    return (
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {isLoading ? <Skeleton width="100%" height={72} radius={16} />
          : isError ? <ErrorState onRetry={refetch} />
          : data && data.length > 0 ? data.map((th) => (
            <Pressable key={th.id} testID={`chat-thread-${th.id}`} onPress={() => onOpen(th)}>
              <Card>
                <View style={styles.threadRow}>
                  <View style={styles.threadInfo}>
                    <Text style={[TextScale.body, { color: colors.ink }]} numberOfLines={1}>
                      {th.name}{th.role ? ` · ${th.role}` : ''}
                    </Text>
                    {th.lastMessage ? (
                      <Text style={[TextScale.caption, { color: colors.inkSoft }]} numberOfLines={1}>{th.lastMessage}</Text>
                    ) : null}
                  </View>
                  {th.unread > 0 ? <Pill label={String(th.unread)} color="#FFFFFF" bg={role.accent} /> : null}
                </View>
              </Card>
            </Pressable>
          )) : (
            <Text testID="chat-empty" style={[TextScale.caption, { color: colors.inkSoft, marginTop: 8 }]}>{t('chat.empty')}</Text>
          )}
      </ScrollView>
    );
  }

  function Conversation({ thread }: { thread: ChatThread; insets: typeof insets }) {
    const { data, isLoading, isError, refetch } = useChatMessages(thread.id);
    const send = useSendMessage(thread.id);
    const [text, setText] = useState('');

    const onSend = () => {
      const body = text.trim();
      if (!body || send.isPending) return;
      send.mutate(body, { onSuccess: () => setText('') });
    };

    return (
      <View style={styles.fill}>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 16 }]}>
          {isLoading ? <Skeleton width="100%" height={60} radius={12} />
            : isError ? <ErrorState onRetry={refetch} />
            : data && data.length > 0 ? data.map((m) => (
              <View
                key={m.id}
                testID={`chat-message-${m.id}`}
                style={[styles.bubble, m.isMine
                  ? { alignSelf: 'flex-end', backgroundColor: role.accent }
                  : { alignSelf: 'flex-start', backgroundColor: colors.surface2 }]}
              >
                <Text style={[TextScale.body, { color: m.isMine ? '#FFFFFF' : colors.ink }]}>{m.text}</Text>
                <Text style={[TextScale.caption, { color: m.isMine ? '#FFFFFFCC' : colors.inkSoft, marginTop: 2 }]}>{formatTime(m.sentAt)}</Text>
              </View>
            )) : (
              <Text style={[TextScale.caption, { color: colors.inkSoft, marginTop: 8 }]}>{t('chat.noMessages')}</Text>
            )}
        </ScrollView>
        <View style={[styles.composer, { paddingBottom: insets.bottom + 10, borderTopColor: colors.sunken, backgroundColor: colors.surface }]}>
          <TextInput
            testID="chat-input"
            placeholder={t('chat.inputPlaceholder')}
            placeholderTextColor={colors.inkFaint}
            value={text}
            onChangeText={setText}
            multiline
            style={[styles.input, { borderColor: colors.sunken, color: colors.ink }]}
          />
          <Btn testID="chat-send" label={t('chat.send')} accent={role.accent} onPress={onSend} loading={send.isPending} disabled={!text.trim()} />
        </View>
      </View>
    );
  }
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  headerSpacer: { flex: 1 },
  body: { padding: 16, gap: 10 },
  threadRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  threadInfo: { flex: 1, gap: 2 },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 110 },
});
