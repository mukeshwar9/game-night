import { Link } from 'react-router-dom'
import DeadEnd, { deadEndPrimaryClass } from '../components/DeadEnd'

export default function NotFound() {
  return (
    <DeadEnd
      title="PAGE NOT FOUND"
      message="This link doesn't go anywhere. It may be mistyped or out of date."
      primary={<Link to="/games" className={deadEndPrimaryClass}>BROWSE GAMES</Link>}
    />
  )
}
