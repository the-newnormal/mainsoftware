// What the avatar menu holds (T21; OD-05): a registry, so each later step adds its own entry here
// and the menu itself never changes (C0.14 to C0.18's devices and notifications; later sections of
// Settings go in its own registry, settings/sections.ts). It holds, in order:
// - Settings (C0.9 PD-47): everyone's, opening /settings, where the privacy notice is always
//   available (PDPA-02);
// - Data protection (C0.9 PD-26, OD-03): the DPO's pages, shown only when the session answer's
//   capabilities say can() allows reading them (registers). Hiding it is a courtesy, never the
//   check: the pages' every request is decided by the server, which refuses anyone else. From C0.9
//   PR 3b (OD-22, PD-98, PD-99, PPL-02) it carries the session answer's count of requests needing
//   attention (none at 0), and opens the queue (/dpo/requests), the first link, once the person has
//   acknowledged the current notice, so it leads straight to what its badge counts; before that
//   (the DPO's setup before v0) it opens the processing register, the first setup task, since a
//   case read would be refused with notice_required and move the tab to /notice;
// - Sign out.
//
// Sign out asks the session runtime to sign out (session/runtime.ts): a 2xx or a 401 ends the
// document, and the next one is the sign-in screen with "You've signed out." When no answer comes
// back (offline, a 5xx), the session and this document stay as they were, and an error toast says
// so; it stays until it is closed (X5), and focus is back on the menu's button already.
import type { SessionForClient } from '@hearth/shared'
import { LogOut, type LucideIcon, Settings, ShieldCheck } from 'lucide-react'
import type { AppPath } from '@/router/paths.ts'
import type { SessionRuntime } from '@/session/runtime.ts'
import { SHELL } from '@/strings/shell.ts'
import { countText } from '@/ui/CountBadge.tsx'
import { toast } from '@/ui/toast.ts'

// What an item may act with: the document's session runtime, and the router's way to another app
// path in this document.
export interface AvatarMenuContext {
  readonly runtime: SessionRuntime
  navigate(to: AppPath): void
}

// The session answer as an item reads it. Every field is optional, so an entry the cache holds
// unparsed, or a runtime's info from before a field existed, reads as "not allowed", never a crash.
export type MenuSession = {
  readonly capabilities?: Partial<SessionForClient['capabilities']>
  readonly requests?: number | null
}

// The DPO's count of requests needing attention (C0.9 PD-99), when there is one to show: a whole
// number above 0; anything else, none.
export function requestsCount(session: MenuSession): number | undefined {
  const count = session.requests
  return typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : undefined
}

export interface AvatarMenuItem {
  readonly id: string
  readonly label: string
  readonly icon: LucideIcon
  // Whether the person sees it; always, when absent.
  shown?(session: MenuSession): boolean
  // A count after the label, and the item's accessible name with it; none when absent.
  badge?(session: MenuSession): { text: string; label: string } | undefined
  run(context: AvatarMenuContext): Promise<void>
}

export const settingsItem: AvatarMenuItem = {
  id: 'settings',
  label: SHELL.account.settings,
  icon: Settings,
  async run({ navigate }) {
    navigate('/settings')
  },
}

export const dpoItem: AvatarMenuItem = {
  id: 'data-protection',
  label: SHELL.account.dataProtection,
  icon: ShieldCheck,
  // Only a literal true: the lenient session reading gives false for anything else (P6).
  shown: session => session.capabilities?.registers === true,
  badge: session => {
    const count = requestsCount(session)
    return count === undefined ? undefined : { text: countText(count), label: SHELL.account.dataProtectionCount(count) }
  },
  async run({ runtime, navigate }) {
    navigate(runtime.notice.standing() === 'acknowledged' ? '/dpo/requests' : '/dpo/purposes')
  },
}

export const signOutItem: AvatarMenuItem = {
  id: 'sign-out',
  label: SHELL.account.signOut,
  icon: LogOut,
  async run({ runtime }) {
    if ((await runtime.signOut()) === 'failed') toast({ tone: 'error', text: SHELL.account.signOutFailed })
  },
}

export const AVATAR_MENU: readonly AvatarMenuItem[] = [settingsItem, dpoItem, signOutItem]

// The items this person sees, in the registry's order.
export function menuItemsFor(session: MenuSession): AvatarMenuItem[] {
  return AVATAR_MENU.filter(item => item.shown?.(session) ?? true)
}
