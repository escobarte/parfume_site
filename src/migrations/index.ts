import * as migration_20260804_185510_initial from './20260804_185510_initial'

export const migrations = [
  {
    up: migration_20260804_185510_initial.up,
    down: migration_20260804_185510_initial.down,
    name: '20260804_185510_initial',
  },
]
