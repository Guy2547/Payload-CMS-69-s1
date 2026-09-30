import * as migration_20260928_210429 from './20260928_210429';
import * as migration_20260930_041156 from './20260930_041156';

export const migrations = [
  {
    up: migration_20260928_210429.up,
    down: migration_20260928_210429.down,
    name: '20260928_210429',
  },
  {
    up: migration_20260930_041156.up,
    down: migration_20260930_041156.down,
    name: '20260930_041156'
  },
];
