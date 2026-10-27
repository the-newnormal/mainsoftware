// A count on a pill (C0.9 OD-22, PD-99, PPL-05, PPL-12): the DPO's requests needing attention, on
// the avatar button, on the avatar menu's "Data protection" and on the Requests link. The number is
// text (never colour alone), at most "99+", and hidden from assistive technology: the control it
// sits on says the count in words in its own accessible name. Ink on the surface's opposite (surface
// on fg, TEXT_PAIRS), or fg on surface where it sits on an ink fill (the current link). Zero, or no
// count, renders nothing.
import { cx } from './cx.ts'

// The pill's shape and type: 12 px figures of one width in a pill at least 20 px across.
export const COUNT_PILL =
  'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums'

const TONES = { ink: 'bg-fg text-surface', inverse: 'bg-surface text-fg' } as const

// The count as the pill shows it.
export const countText = (count: number): string => (count > 99 ? '99+' : String(count))

export function CountBadge({
  count,
  tone = 'ink',
  className,
}: {
  count: number | null | undefined
  tone?: keyof typeof TONES
  className?: string
}) {
  if (count === null || count === undefined || !(count > 0)) return null
  return (
    <span aria-hidden className={cx(COUNT_PILL, TONES[tone], className)}>
      {countText(count)}
    </span>
  )
}
