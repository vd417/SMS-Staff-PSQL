import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, Image, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { Card, Btn, Pill, Skeleton, IconBtn, Avatar, useToast } from '@/components/ui';
import { tabBarHeight } from '@/components/ui/TabBar';
import { ErrorState } from '@/components/state';
import { TextScale } from '@/theme/typography';
import { useKeyboardInset } from '@/lib/useKeyboardInset';
import { useChatThreads, useChatMessages, useSendMessage, useChatContacts, useCreateThread } from '@/features/chat/hooks';
import type { ChatThread, ChatContact } from '@/data/domain';

const formatTime = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export const MessagesScreen = () => {
  const { t } = useTranslation();
  const { colors, role } = useTheme();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<ChatThread | null>(null);

  // Inbox tab root = the list (no back); inside a conversation, back returns to the list.
  const title = active ? active.name : t('inbox.title');

  return (
    <SafeAreaView testID="messages-screen" edges={['top', 'left', 'right']} style={[styles.fill, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        {active ? (
          <IconBtn testID="chat-back" icon="back" label={t('common.back')} onPress={() => setActive(null)} />
        ) : null}
        {active ? <Avatar name={active.name} size={40} photoUri={active.photoUrl} /> : null}
        <View style={styles.headerTitle}>
          <Text style={[TextScale.screenTitle, { color: colors.ink }]} numberOfLines={1}>{title}</Text>
          {active?.role ? (
            <Text style={[TextScale.caption, { color: colors.inkSoft }]} numberOfLines={1}>{active.role}</Text>
          ) : null}
        </View>
      </View>
      {active ? (
        <Conversation thread={active} insets={insets} />
      ) : (
        <InboxList onOpen={setActive} />
      )}
    </SafeAreaView>
  );

  function InboxList({ onOpen }: { onOpen: (t: ChatThread) => void }) {
    const threads = useChatThreads();
    const contacts = useChatContacts();
    const create = useCreateThread();
    const toast = useToast();

    const startChat = (c: ChatContact) => {
      if (create.isPending) return;
      create.mutate(c, {
        onSuccess: (th) => onOpen(th.photoUrl || !c.photoUrl ? th : { ...th, photoUrl: c.photoUrl }),
        onError: () => toast.show(t('common.somethingWrong'), 'error'),
      });
    };

    const hasThreads = !!threads.data && threads.data.length > 0;

    return (
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: 24 }]}>
        {/* Existing conversations */}
        {hasThreads ? (
          <>
            <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{t('chat.chats')}</Text>
            {threads.data!.map((th) => {
              const photo = th.photoUrl || contacts.data?.find((c) => c.name === th.name)?.photoUrl;
              return (
              <Pressable key={th.id} testID={`chat-thread-${th.id}`} onPress={() => onOpen(photo && !th.photoUrl ? { ...th, photoUrl: photo } : th)}>
                <Card>
                  <View style={styles.row}>
                    <Avatar name={th.name} size={50} photoUri={photo} />
                    <View style={styles.rowInfo}>
                      <View style={styles.rowTop}>
                        <Text style={[TextScale.body, styles.name, { color: colors.ink, fontWeight: th.unread > 0 ? '700' : '600' }]} numberOfLines={1}>{th.name}</Text>
                        {th.lastAt ? (
                          <Text style={[TextScale.caption, { color: colors.inkSoft }]}>{formatTime(th.lastAt)}</Text>
                        ) : null}
                      </View>
                      {th.role ? (
                        <Text style={[TextScale.caption, { color: colors.inkSoft }]} numberOfLines={1}>{th.role}</Text>
                      ) : null}
                      <View style={styles.rowTop}>
                        {th.lastMessageMine && th.lastMessageStatus ? (
                          <Ionicons
                            testID={`chat-list-tick-${th.lastMessageStatus}`}
                            name={th.lastMessageStatus === 'sent' ? 'checkmark' : 'checkmark-done'}
                            size={14}
                            color={th.lastMessageStatus === 'read' ? '#53BDEB' : colors.inkSoft}
                          />
                        ) : null}
                        <Text style={[TextScale.caption, styles.name, { color: th.unread > 0 ? colors.ink : colors.inkSoft }]} numberOfLines={1}>
                          {th.lastMessage || t('chat.noMessages')}
                        </Text>
                      </View>
                    </View>
                    {th.unread > 0 ? <Pill label={String(th.unread)} color="#FFFFFF" bg={role.accent} /> : null}
                  </View>
                </Card>
              </Pressable>
              );
            })}
          </>
        ) : null}

        {/* People the staff member can chat with */}
        <Text style={[TextScale.caption, { color: colors.inkSoft, marginTop: hasThreads ? 8 : 0 }]}>{t('chat.people')}</Text>
        {contacts.isLoading ? <Skeleton width="100%" height={64} radius={16} />
          : contacts.isError ? <ErrorState onRetry={contacts.refetch} />
          : contacts.data && contacts.data.length > 0 ? contacts.data.map((c) => (
            <Pressable key={c.id} testID={`chat-contact-${c.id}`} onPress={() => startChat(c)} disabled={create.isPending}>
              <Card>
                <View style={styles.row}>
                  <Avatar name={c.name} size={48} photoUri={c.photoUrl} />
                  <View style={styles.rowInfo}>
                    <Text style={[TextScale.body, { color: colors.ink }]} numberOfLines={1}>{c.name}</Text>
                    {c.role ? <Text style={[TextScale.caption, { color: colors.inkSoft }]} numberOfLines={1}>{c.role}</Text> : null}
                  </View>
                </View>
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
    const listRef = useRef<ScrollView>(null);
    const stickToBottom = useRef(true);
    const keyboardInset = useKeyboardInset();
    const lift = keyboardInset > 0 ? Math.max(0, keyboardInset - tabBarHeight(insets.bottom)) : 0;

    const scrollToLatest = useCallback((animated: boolean) => {
      if (!stickToBottom.current) return;
      listRef.current?.scrollToEnd({ animated });
    }, []);

    useEffect(() => {
      const frame = requestAnimationFrame(() => scrollToLatest(false));
      return () => cancelAnimationFrame(frame);
    }, [data?.length, scrollToLatest]);

    useEffect(() => {
      if (keyboardInset === 0) return;
      stickToBottom.current = true;
      const frame = requestAnimationFrame(() => scrollToLatest(true));
      const timer = setTimeout(() => scrollToLatest(true), 80);
      return () => {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
      };
    }, [keyboardInset, scrollToLatest]);

    const onMessageScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
      if (distanceFromBottom < 80) stickToBottom.current = true;
    };

    const onSend = () => {
      const body = text.trim();
      if (!body || send.isPending) return;
      stickToBottom.current = true;
      send.mutate(body, {
        onSuccess: () => {
          setText('');
          requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
        },
      });
    };

    return (
      <View style={[styles.fill, lift > 0 && { marginBottom: lift }]}>
        <ScrollView
          ref={listRef}
          style={styles.fill}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => scrollToLatest(false)}
          onScroll={onMessageScroll}
          onScrollBeginDrag={() => { stickToBottom.current = false; }}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.body,
            { paddingBottom: 16 },
            data && data.length > 0 ? styles.threadFill : null,
          ]}
        >
          {isLoading ? <Skeleton width="100%" height={60} radius={12} />
            : isError ? <ErrorState onRetry={refetch} />
            : data && data.length > 0 ? data.map((m) => (
              <View
                key={m.id}
                testID={`chat-message-${m.id}`}
                style={[styles.msgWrap, m.isMine ? styles.msgMine : styles.msgOther]}
              >
                {m.isMine ? null : <Avatar name={thread.name} size={32} photoUri={thread.photoUrl} />}
                <View
                  style={[styles.bubble, m.isMine
                    ? { backgroundColor: role.accent }
                    : { backgroundColor: colors.surface2 }]}
                >
                  {m.imageUrl ? (
                    <Image testID={`chat-image-${m.id}`} source={{ uri: m.imageUrl }} style={styles.bubbleImage} resizeMode="cover" />
                  ) : null}
                  {m.text ? (
                    <Text style={[TextScale.body, { color: m.isMine ? '#FFFFFF' : colors.ink }]}>{m.text}</Text>
                  ) : null}
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
              </View>
            )) : (
              <Text style={[TextScale.caption, { color: colors.inkSoft, marginTop: 8 }]}>{t('chat.noMessages')}</Text>
            )}
        </ScrollView>
        <View style={[styles.composer, { paddingBottom: keyboardInset > 0 ? 8 : 10, borderTopColor: colors.sunken, backgroundColor: colors.surface }]}>
          <TextInput
            testID="chat-input"
            placeholder={t('chat.inputPlaceholder')}
            placeholderTextColor={colors.inkFaint}
            value={text}
            onChangeText={setText}
            onFocus={() => {
              stickToBottom.current = true;
              requestAnimationFrame(() => scrollToLatest(true));
            }}
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
  headerTitle: { flex: 1, gap: 2 },
  body: { padding: 16, gap: 10 },
  threadFill: { flexGrow: 1, justifyContent: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowInfo: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1 },
  msgWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '82%' },
  msgMine: { alignSelf: 'flex-end' },
  msgOther: { alignSelf: 'flex-start' },
  bubble: { flexShrink: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleImage: { width: 180, height: 180, borderRadius: 12, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 110 },
});
