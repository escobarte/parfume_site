import {
  CatalogSectionPage,
  sectionMetadata,
  type SectionPageProps,
} from '@/components/catalog/CatalogSectionPage'

/** «Lip balm» — закрытый раздел `productCategory = lipBalm` (см. `sections.ts`). */
export const generateMetadata = (props: SectionPageProps) => sectionMetadata('lipBalm', props)

export default function LipBalmPage(props: SectionPageProps) {
  return <CatalogSectionPage section="lipBalm" {...props} />
}
