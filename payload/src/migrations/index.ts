import * as migration_20260930_055726 from './20260930_055726';
import * as migration_20260930_130000 from './20260930_130000';
import * as migration_20261003_140000 from './20261003_140000';

export const migrations = [
  {
    up: migration_20260930_055726.up,
    down: migration_20260930_055726.down,
    name: '20260930_055726',
  },
  {
    up: migration_20260930_130000.up,
    down: migration_20260930_130000.down,
    name: '20260930_130000',
  },
  {
    up: migration_20261003_140000.up,
    down: migration_20261003_140000.down,
    name: '20261003_140000',
  },
];
