import { setRequestLocale } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

// Временная QA-страница фазы 1 — проверка токенов/tailwind/shadcn.
// Удалить или заменить стайлгайдом в фазе 6 (интеграция дизайна).
export default async function UiKitPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-medium">UI kit — токены фазы 1</h1>

      <div className="flex flex-wrap gap-3">
        <Button>Основная</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
      </div>

      <Input placeholder="Поле ввода" />

      <Select>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Выбрать объём" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="30">30 мл</SelectItem>
          <SelectItem value="50">50 мл</SelectItem>
          <SelectItem value="100">100 мл</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex flex-wrap gap-2">
        <Badge>Новинка</Badge>
        <Badge variant="secondary">Хит</Badge>
        <Badge variant="destructive">Нет в наличии</Badge>
        <Badge variant="outline">Акция</Badge>
      </div>

      <Skeleton className="h-24 w-full" />
    </div>
  )
}
