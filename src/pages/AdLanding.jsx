import { Navigate, useLocation, useParams } from 'react-router-dom'
import { landingPath } from '../lib/adLanding'

// /play/<game>: the URL ads point at. Sends the visitor straight into that
// game against the CPU (or the default headline game for anything else),
// keeping the query string so UTM and click-id tags reach attribution.
export default function AdLanding() {
  const { type } = useParams()
  const { search } = useLocation()
  return <Navigate to={landingPath(type, search)} state={{ landing: true }} replace />
}
