import { ROLES, ROLE_KEYS, type Role } from '@/theme/roles';

describe('ROLES', () => {
  it('defines exactly the 6 business roles in display order', () => {
    expect(ROLE_KEYS).toEqual([
      'driver', 'conductor', 'sweeper', 'gardener', 'guard', 'peon',
    ]);
  });
  it('does not include the removed cook or clerk roles', () => {
    expect(ROLE_KEYS).not.toContain('cook');
    expect(ROLE_KEYS).not.toContain('clerk');
  });
  it('each role has accent, icon, dutyPost label key, and a card kind matching its key', () => {
    (ROLE_KEYS as readonly Role[]).forEach((k) => {
      const r = ROLES[k];
      expect(r.key).toBe(k);
      expect(r.accent).toMatch(/^#/);
      expect(r.accentSoft).toMatch(/^#/);
      expect(typeof r.icon).toBe('string');
      expect(typeof r.labelKey).toBe('string');
      expect(typeof r.dutyPostLabelKey).toBe('string');
      expect(r.roleCardKind).toBe(k);
    });
  });
  it('driver uses the handoff accent and conductor has its own accent', () => {
    expect(ROLES.driver.accent).toBe('#0E5C4A');
    expect(ROLES.conductor.accent).toBe('#C2567E');
  });
});
