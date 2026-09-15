import {
  CatalogSectionPage,
  sectionMetadata,
  type SectionPageProps,
} from '@/components/catalog/CatalogSectionPage'

/** «Body Care» — закрытый раздел `productCategory = bodyCare` (см. `sections.ts`). */
export const generateMetadata = (props: SectionPageProps) => sectionMetadata('bodyCare', props)

export default function BodyCarePage(props: SectionPageProps) {
  return <CatalogSectionPage section="bodyCare" {...props} />
}
