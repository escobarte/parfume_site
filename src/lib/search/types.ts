export type SuggestionType = 'product' | 'brand' | 'category'

export type Suggestion = {
  type: SuggestionType
  title: string
  slug: string
  href: string
}
