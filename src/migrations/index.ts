import * as migration_20260804_185510_initial from './20260804_185510_initial'
import * as migration_20260804_200000_search from './20260804_200000_search'
import * as migration_20260805_133900_orders_csv from './20260805_133900_orders_csv'
import * as migration_20260810_063924_discounts_promo from './20260810_063924_discounts_promo'

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
  {
    up: migration_20260805_133900_orders_csv.up,
    down: migration_20260805_133900_orders_csv.down,
    name: '20260805_133900_orders_csv',
  },
  {
    up: migration_20260810_063924_discounts_promo.up,
    down: migration_20260810_063924_discounts_promo.down,
    name: '20260810_063924_discounts_promo',
  },
]
