import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Back is a real step back when there is one. A screen opened straight from a link (no
 * earlier entry, the "default" key) goes to `fallback` by path instead, replacing this entry
 * so Back from there leaves the flow cleanly. Every Back button in the three apps uses it:
 * a Back that pushes its parent as a new entry makes two screens send you to each other.
 */
export function useBack(fallback: string): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  return () => (location.key === 'default' ? navigate(fallback, { replace: true }) : navigate(-1))
}
