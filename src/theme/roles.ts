import type { IconName } from '@/components/icons';

export const ROLE_KEYS = [
  'driver', 'conductor', 'sweeper', 'gardener', 'guard', 'peon',
] as const;

export type Role = (typeof ROLE_KEYS)[number];

export interface RoleConfig {
  key: Role;
  labelKey: string;
  icon: IconName;
  accent: string;
  accentSoft: string;
  dutyPostLabelKey: string;
  roleCardKind: Role;
}

export const ROLES: Record<Role, RoleConfig> = {
  driver: {
    key: 'driver', labelKey: 'role.driver', icon: 'bus',
    accent: '#0E5C4A', accentSoft: '#CDE7DF', dutyPostLabelKey: 'dutyPost.driver', roleCardKind: 'driver',
  },
  conductor: {
    key: 'conductor', labelKey: 'role.conductor', icon: 'visitor',
    accent: '#C2567E', accentSoft: '#F6D6E4', dutyPostLabelKey: 'dutyPost.conductor', roleCardKind: 'conductor',
  },
  sweeper: {
    key: 'sweeper', labelKey: 'role.sweeper', icon: 'broom',
    accent: '#23A79C', accentSoft: '#CCECE8', dutyPostLabelKey: 'dutyPost.sweeper', roleCardKind: 'sweeper',
  },
  gardener: {
    key: 'gardener', labelKey: 'role.gardener', icon: 'leaf',
    accent: '#4C9E55', accentSoft: '#D6ECD6', dutyPostLabelKey: 'dutyPost.gardener', roleCardKind: 'gardener',
  },
  guard: {
    key: 'guard', labelKey: 'role.guard', icon: 'shield',
    accent: '#3B7FD4', accentSoft: '#D2E2F7', dutyPostLabelKey: 'dutyPost.guard', roleCardKind: 'guard',
  },
  peon: {
    key: 'peon', labelKey: 'role.peon', icon: 'bell',
    accent: '#8A6ED4', accentSoft: '#E2D9F6', dutyPostLabelKey: 'dutyPost.peon', roleCardKind: 'peon',
  },
};
