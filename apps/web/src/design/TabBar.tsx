import type { ComponentType } from 'react'
import { NavLink } from 'react-router-dom'

export interface TabItem {
  to: string
  label: string
  end?: boolean
  Icon: ComponentType<{ active: boolean }>
}

/**
 * The bottom navigation of the operator app. Boosted's navbar on a phone: five equal cells,
 * ink type, the active one carries a 3px orange bar on top, nothing is underlined.
 */
export function TabBar({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav aria-label={label} className="sticky bottom-0 mt-auto flex border-t-2 border-line bg-paper pb-[env(safe-area-inset-bottom)]">
      {items.map(({ to, label: text, end, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end ?? false}
          className={({ isActive }) =>
            `relative flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[0.75rem] font-bold ${
              isActive ? 'text-ink' : 'text-muted'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span aria-hidden="true" className="absolute inset-x-3 top-0 h-[3px] bg-brand" />}
              <Icon active={isActive} />
              {text}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
