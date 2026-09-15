import {
  CatalogSectionPage,
  sectionMetadata,
  type SectionPageProps,
} from '@/components/catalog/CatalogSectionPage'

/** «For Him» — закрытый раздел: `gender = male`, только парфюмерия (см. `sections.ts`). */
export const generateMetadata = (props: SectionPageProps) => sectionMetadata('forHim', props)

export default function ForHimPage(props: SectionPageProps) {
  return <CatalogSectionPage section="forHim" {...props} />
}
