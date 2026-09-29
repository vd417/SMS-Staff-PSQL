import { createStore } from '@/data/mock/store';
import { mockIssues } from '@/data/mock/issues.repo';

jest.mock('@react-native-async-storage/async-storage', () => {
  let mem: Record<string, string> = {};
  return { __esModule: true, default: {
    getItem: jest.fn((k: string) => Promise.resolve(mem[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => { mem[k] = v; return Promise.resolve(); }),
    removeItem: jest.fn((k: string) => { delete mem[k]; return Promise.resolve(); }),
    clear: jest.fn(() => { mem = {}; return Promise.resolve(); }),
  } };
});
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

describe('mock issues repo', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('starts empty', async () => {
    const repo = mockIssues(await createStore());
    expect(await repo.list()).toEqual([]);
  });

  it('create adds an issue with status open and returns it', async () => {
    const repo = mockIssues(await createStore());
    const created = await repo.create({
      category: 'safety',
      title: 'Loose seatbelt',
      description: 'Row 3 seatbelt is broken.',
      priority: 'high',
    });
    expect(created.status).toBe('open');
    expect(created.title).toBe('Loose seatbelt');
    expect(created.id).toBeTruthy();
  });

  it('get returns the created issue including its attached photo', async () => {
    const repo = mockIssues(await createStore());
    const created = await repo.create({
      category: 'other', title: 'With photo', description: 'd', priority: 'normal',
      photoUri: 'data:image/jpeg;base64,xyz',
    });
    const fetched = await repo.get(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.photoUrl).toBe('data:image/jpeg;base64,xyz');
  });

  it('create prepends the new issue so list() returns newest first', async () => {
    const repo = mockIssues(await createStore());
    await repo.create({ category: 'other', title: 'First', description: 'd', priority: 'normal' });
    await repo.create({ category: 'other', title: 'Second', description: 'd', priority: 'normal' });
    const list = await repo.list();
    expect(list[0].title).toBe('Second');
    expect(list[1].title).toBe('First');
  });
});
