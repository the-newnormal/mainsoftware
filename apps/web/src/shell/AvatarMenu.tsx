// The person's menu (T21; OD-05, X10): the avatar in a 44 px button named "Account, {name}", which
// opens the kit's Menu over the AVATAR_MENU registry, less the items this person isn't shown (the
// session answer's capabilities; C0.9 PD-26). The name shows again at the top of the popup as
// decoration (the button's name already says it). On a phone it sits beside the screen's h1 and
// opens downward from the right; on the rail it sits in the rail's foot and opens upward over the
// screen, and the rail is laid out so nothing clips it (the Menu contract, ui/Menu.tsx).
//
// For the DPO (C0.9 OD-22, PD-99, PPL-05), the session answer's count of requests needing attention
// shows on the avatar's corner and in the button's name ("Account, {name}, 2 requests need
// attention"), so it shows the moment the DPO opens Hearth, and on "Data protection" in the menu.
// With no count, or 0, the button renders exactly as it did before.
import { useNavigate } from '@tanstack/react-router'
import { useSession } from '@/api/queries.ts'
import { useRuntime } from '@/app/runtime-context.ts'
import { SHELL } from '@/strings/shell.ts'
import { Avatar } from '@/ui/Avatar.tsx'
import { IconButton } from '@/ui/Button.tsx'
import { CountBadge } from '@/ui/CountBadge.tsx'
import { Menu, type MenuItem } from '@/ui/Menu.tsx'
import { type AvatarMenuContext, menuItemsFor, requestsCount } from './avatar-menu.ts'

export interface AvatarMenuProps {
  placement: 'bottom-end' | 'top-start'
}

export function AvatarMenu({ placement }: AvatarMenuProps) {
  const runtime = useRuntime()
  const person = useSession()
  const navigate = useNavigate()
  const context: AvatarMenuContext = { runtime, navigate: to => void navigate({ to }) }
  const items: MenuItem[] = menuItemsFor(person).map(item => {
    const badge = item.badge?.(person)
    return {
      id: item.id,
      label: item.label,
      icon: item.icon,
      onSelect: () => void item.run(context),
      ...(badge === undefined ? {} : { badge }),
    }
  })
  const count = person.capabilities.registers ? requestsCount(person) : undefined
  const avatar = <Avatar personId={person.personId} name={person.name} size="sm" decorative />
  return (
    <Menu
      label={SHELL.account.menu}
      heading={person.name}
      items={items}
      placement={placement}
      trigger={props => (
        <IconButton
          {...props}
          label={
            count === undefined
              ? SHELL.account.trigger(person.name)
              : SHELL.account.triggerWithRequests(person.name, count)
          }
          icon={
            count === undefined ? (
              avatar
            ) : (
              <span className="relative inline-flex">
                {avatar}
                <CountBadge count={count} className="absolute -top-1 -right-1.5 ring-2 ring-surface" />
              </span>
            )
          }
        />
      )}
    />
  )
}
