import * as migration_20260928_210429 from './20260928_210429';

export const migrations = [
  {
    up: migration_20260928_210429.up,
    down: migration_20260928_210429.down,
    name: '20260928_210429'
  },
];
