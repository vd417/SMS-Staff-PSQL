export interface Task {
  id: string;
  title: string;
  detail?: string;
  priority: 'urgent' | 'normal';
  done: boolean;
  dueLabel?: string;
  photoUrl?: string;
  remark?: string;
}
