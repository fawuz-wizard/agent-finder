import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Back is a real step back when there is one. A screen opened straight from a link (no
 * earlier entry, the "default" key) goes to `fallback` by path instead, replacing this entry
 * so Back from there leaves the flow cleanly. The directions screen set the rule; every
 * customer screen uses it.
 */
export function useBack(fallback: string): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  return () => (location.key === 'default' ? navigate(fallback, { replace: true }) : navigate(-1))
}
