import * as migration_20260804_185510_initial from './20260804_185510_initial'
import * as migration_20260804_200000_search from './20260804_200000_search'

export const migrations = [
  {
    up: migration_20260804_185510_initial.up,
    down: migration_20260804_185510_initial.down,
    name: '20260804_185510_initial',
  },
  {
    up: migration_20260804_200000_search.up,
    down: migration_20260804_200000_search.down,
    name: '20260804_200000_search',
  },
]
