import * as migration_20260804_185510_initial from './20260804_185510_initial';
import * as migration_20260804_200000_search from './20260804_200000_search';
import * as migration_20260805_133900_orders_csv from './20260805_133900_orders_csv';
import * as migration_20260810_063924_discounts_promo from './20260810_063924_discounts_promo';
import * as migration_20260810_122918_phase4_5_fixes from './20260810_122918_phase4_5_fixes';
import * as migration_20260811_090518_phase4_6_order_flow from './20260811_090518_phase4_6_order_flow';
import * as migration_20260811_094105_phase4_7_order_status from './20260811_094105_phase4_7_order_status';
import * as migration_20260811_201337_phase5_pages_collection from './20260811_201337_phase5_pages_collection';
import * as migration_20260811_202528_phase5_link_targets_pages from './20260811_202528_phase5_link_targets_pages';
import * as migration_20260822_140412_phase8_1_title_not_localized from './20260822_140412_phase8_1_title_not_localized';
import * as migration_20260827_104719_phase9_1_checkout_mode_address from './20260827_104719_phase9_1_checkout_mode_address';
import * as migration_20260905_084956_phase11_1_gender_kids_product_category from './20260905_084956_phase11_1_gender_kids_product_category';
import * as migration_20260905_091602_phase11_1_gift_items from './20260905_091602_phase11_1_gift_items';
import * as migration_20260905_094509_phase11_1_country_of_origin from './20260905_094509_phase11_1_country_of_origin';
import * as migration_20260905_125324_phase11_2_delivery_method from './20260905_125324_phase11_2_delivery_method';
import * as migration_20260905_130249_phase11_2_payment_method from './20260905_130249_phase11_2_payment_method';
import * as migration_20260905_131227_phase11_2_promo_codes from './20260905_131227_phase11_2_promo_codes';

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
  {
    up: migration_20260810_122918_phase4_5_fixes.up,
    down: migration_20260810_122918_phase4_5_fixes.down,
    name: '20260810_122918_phase4_5_fixes',
  },
  {
    up: migration_20260811_090518_phase4_6_order_flow.up,
    down: migration_20260811_090518_phase4_6_order_flow.down,
    name: '20260811_090518_phase4_6_order_flow',
  },
  {
    up: migration_20260811_094105_phase4_7_order_status.up,
    down: migration_20260811_094105_phase4_7_order_status.down,
    name: '20260811_094105_phase4_7_order_status',
  },
  {
    up: migration_20260811_201337_phase5_pages_collection.up,
    down: migration_20260811_201337_phase5_pages_collection.down,
    name: '20260811_201337_phase5_pages_collection',
  },
  {
    up: migration_20260811_202528_phase5_link_targets_pages.up,
    down: migration_20260811_202528_phase5_link_targets_pages.down,
    name: '20260811_202528_phase5_link_targets_pages',
  },
  {
    up: migration_20260822_140412_phase8_1_title_not_localized.up,
    down: migration_20260822_140412_phase8_1_title_not_localized.down,
    name: '20260822_140412_phase8_1_title_not_localized',
  },
  {
    up: migration_20260827_104719_phase9_1_checkout_mode_address.up,
    down: migration_20260827_104719_phase9_1_checkout_mode_address.down,
    name: '20260827_104719_phase9_1_checkout_mode_address',
  },
  {
    up: migration_20260905_084956_phase11_1_gender_kids_product_category.up,
    down: migration_20260905_084956_phase11_1_gender_kids_product_category.down,
    name: '20260905_084956_phase11_1_gender_kids_product_category',
  },
  {
    up: migration_20260905_091602_phase11_1_gift_items.up,
    down: migration_20260905_091602_phase11_1_gift_items.down,
    name: '20260905_091602_phase11_1_gift_items',
  },
  {
    up: migration_20260905_094509_phase11_1_country_of_origin.up,
    down: migration_20260905_094509_phase11_1_country_of_origin.down,
    name: '20260905_094509_phase11_1_country_of_origin',
  },
  {
    up: migration_20260905_125324_phase11_2_delivery_method.up,
    down: migration_20260905_125324_phase11_2_delivery_method.down,
    name: '20260905_125324_phase11_2_delivery_method',
  },
  {
    up: migration_20260905_130249_phase11_2_payment_method.up,
    down: migration_20260905_130249_phase11_2_payment_method.down,
    name: '20260905_130249_phase11_2_payment_method',
  },
  {
    up: migration_20260905_131227_phase11_2_promo_codes.up,
    down: migration_20260905_131227_phase11_2_promo_codes.down,
    name: '20260905_131227_phase11_2_promo_codes'
  },
];
