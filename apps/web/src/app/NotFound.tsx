import { Link } from 'react-router-dom'
import { Button } from '@/design'

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">That page doesn't exist.</h1>
      <Link to="/find"><Button variant="secondary">Back to Agent Finder</Button></Link>
    </div>
  )
}
