import {
  CatalogSectionPage,
  sectionMetadata,
  type SectionPageProps,
} from '@/components/catalog/CatalogSectionPage'

/** «For Her» — закрытый раздел: `gender = female`, только парфюмерия (см. `sections.ts`). */
export const generateMetadata = (props: SectionPageProps) => sectionMetadata('forHer', props)

export default function ForHerPage(props: SectionPageProps) {
  return <CatalogSectionPage section="forHer" {...props} />
}
