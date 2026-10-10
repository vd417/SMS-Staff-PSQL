export interface ChatThread {
  id: string;
  /** The other party's display name (e.g. the principal/admin/owner). */
  name: string;
  /** Their role label, when the server provides one. */
  role?: string;
  lastMessage?: string;
  lastAt?: string;
  unread: number;
}

export interface ChatContact {
  id: string;
  /** How the server resolves the recipient — "user" for a management account. */
  kind: string;
  name: string;
  /** Friendly role label, e.g. "Principal" / "School Owner". */
  role: string;
}

export type ChatReceiptStatus = 'sent' | 'delivered' | 'read';

export interface ChatMessage {
  id: string;
  text: string;
  sentAt: string;
  /** True when this message was sent by the signed-in staff member. */
  isMine: boolean;
  imageUrl?: string;
  /** Delivery receipt for the staff member's own messages (WhatsApp-style ticks); undefined for incoming. */
  status?: ChatReceiptStatus;
}
