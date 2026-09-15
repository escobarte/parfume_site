import {
  CatalogSectionPage,
  sectionMetadata,
  type SectionPageProps,
} from '@/components/catalog/CatalogSectionPage'

/** «Kids» — закрытый раздел: `gender = kids`, любая категория товара (см. `sections.ts`). */
export const generateMetadata = (props: SectionPageProps) => sectionMetadata('kids', props)

export default function KidsPage(props: SectionPageProps) {
  return <CatalogSectionPage section="kids" {...props} />
}
