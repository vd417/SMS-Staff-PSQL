import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { Card, Btn, Pill, Skeleton, IconBtn, useToast } from '@/components/ui';
import { ErrorState } from '@/components/state';
import { TextScale } from '@/theme/typography';
import { useChatThreads, useChatMessages, useSendMessage, useChatContacts, useCreateThread } from '@/features/chat/hooks';
import type { ChatThread, ChatContact } from '@/data/domain';

const formatTime = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
// The bottom tab bar floats over content (height 64 + 26 margin), so screens inside a tab must
// leave room or their content/composer hides behind it.
const TAB_BAR_CLEARANCE = 100;

export const MessagesScreen = () => {
  const { t } = useTranslation();
  const { colors, role } = useTheme();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<ChatThread | null>(null);

  // Inbox tab root = the list (no back); inside a conversation, back returns to the list.
  const title = active ? active.name : t('inbox.title');

  return (
    <SafeAreaView testID="messages-screen" style={[styles.fill, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        {active ? (
          <IconBtn testID="chat-back" icon="back" label={t('common.back')} onPress={() => setActive(null)} />
        ) : null}
        <Text style={[TextScale.screenTitle, { color: colors.ink }]} numberOfLines={1}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      {active ? (
        <Conversation thread={active} insets={insets} />
      ) : (
        <InboxList onOpen={setActive} insets={insets} />
      )}
    </SafeAreaView>
  );

  function InboxList({ onOpen }: { onOpen: (t: ChatThread) => void; insets: typeof insets }) {
    const threads = useChatThreads();
    const contacts = useChatContacts();
    const create = useCreateThread();
    const toast = useToast();

    const startChat = (c: ChatContact) => {
      if (create.isPending) return;
      create.mutate(c, { onSuccess: onOpen, onError: () => toast.show(t('common.somethingWrong'), 'error') });
    };

    const hasThreads = !!threads.data && threads.data.length > 0;

    return (
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
        {/* Existing conversations */}
        {hasThreads ? (
          <>
            <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t('chat.chats')}</Text>
            {threads.data!.map((th) => (
              <Pressable key={th.id} testID={`chat-thread-${th.id}`} onPress={() => onOpen(th)}>
                <Card>
                  <View style={styles.row}>
                    <View style={styles.rowInfo}>
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
            ))}
          </>
        ) : null}

        {/* People the staff member can chat with */}
        <Text style={[TextScale.caption, { color: colors.inkSoft, marginTop: hasThreads ? 8 : 0 }]}>{t('chat.people')}</Text>
        {contacts.isLoading ? <Skeleton width="100%" height={64} radius={16} />
          : contacts.isError ? <ErrorState onRetry={contacts.refetch} />
          : contacts.data && contacts.data.length > 0 ? contacts.data.map((c) => (
            <Pressable key={c.id} testID={`chat-contact-${c.id}`} onPress={() => startChat(c)} disabled={create.isPending}>
              <Card>
                <Text style={[TextScale.body, { color: colors.ink }]}>{c.name}</Text>
                {c.role ? <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{c.role}</Text> : null}
              </Card>
            </Pressable>
          )) : (
            <Text testID="chat-no-contacts" style={[TextScale.caption, { color: colors.inkSoft, marginTop: 8 }]}>{t('chat.noContacts')}</Text>
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
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.bottom}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: 16 }]}>
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
                <View style={styles.metaRow}>
                  <Text style={[TextScale.caption, { color: m.isMine ? '#FFFFFFCC' : colors.inkSoft }]}>{formatTime(m.sentAt)}</Text>
                  {m.isMine && m.status ? (
                    <Ionicons
                      testID={`chat-tick-${m.status}`}
                      name={m.status === 'sent' ? 'checkmark' : 'checkmark-done'}
                      size={14}
                      color={m.status === 'read' ? '#53BDEB' : '#FFFFFFCC'}
                    />
                  ) : null}
                </View>
              </View>
            )) : (
              <Text style={[TextScale.caption, { color: colors.inkSoft, marginTop: 8 }]}>{t('chat.noMessages')}</Text>
            )}
        </ScrollView>
        <View style={[styles.composer, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE, borderTopColor: colors.sunken, backgroundColor: colors.surface }]}>
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
      </KeyboardAvoidingView>
    );
  }
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  headerSpacer: { flex: 1 },
  body: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowInfo: { flex: 1, gap: 2 },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 110 },
});
