import { FinderBox, FinderHeader } from '@/features/end-user/components/finder'

/**
 * Search: the third tab. What goes here is decided tab by tab with the team; for now the
 * screen states its purpose so the tab has a landing place.
 */
export default function DealerSearchPage() {
  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader title="Search" />
      <FinderBox className="mt-6 px-5 py-4">
        <p className="text-base font-bold">Find one of your agents</p>
        <p className="text-sm font-medium text-finder-muted">By shop name, agent number, Orange code, phone or town. Coming next; your agents on the map will live here too.</p>
      </FinderBox>
    </div>
  )
}
