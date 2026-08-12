/**
 * `<script type="application/ld+json">` — данные приходят из CMS (название
 * товара/бренда и т.п.), поэтому `<`/`>`/`&` экранируются вручную: обычный
 * `JSON.stringify` их не трогает, а буквальный `</script>` в поле CMS
 * закрыл бы тег раньше времени.
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
