import { ArrowLeftRight, Bell, Check, ChevronRight, CircleHelp, Info, LockKeyhole, MapPin, Pause, Power, Radar, ReceiptText, Store, User, Wallet } from 'lucide-react'

/** The agent app's outline icons: Lucide (MIT), 1.8 stroke, as the approved agent design asks. */
const o = { strokeWidth: 1.8, 'aria-hidden': true } as const
export const Icon = {
  power: (size = 30) => <Power size={size} {...o} />,
  receipt: (size = 30) => <ReceiptText size={size} {...o} />,
  wallet: (size = 30) => <Wallet size={size} {...o} />,
  swap: (size = 30) => <ArrowLeftRight size={size} {...o} />,
  pin: (size = 20) => <MapPin size={size} {...o} />,
  target: (size = 20) => <Radar size={size} {...o} />,
  check: (size = 15) => <Check size={size} strokeWidth={3} aria-hidden />,
  pause: (size = 15) => <Pause size={size} strokeWidth={3} aria-hidden />,
  chevron: (size = 18) => <ChevronRight size={size} strokeWidth={2} aria-hidden />,
  user: (size = 22) => <User size={size} {...o} />,
  lock: (size = 22) => <LockKeyhole size={size} {...o} />,
  bell: (size = 22) => <Bell size={size} {...o} />,
  help: (size = 22) => <CircleHelp size={size} {...o} />,
  info: (size = 22) => <Info size={size} {...o} />,
  store: (size = 22) => <Store size={size} {...o} />,
}
