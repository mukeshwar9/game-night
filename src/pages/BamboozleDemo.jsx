import BamboozleMatch from '../components/BamboozleMatch'

// BAMBOOZLE without a room: against one to three bots (/solo/bamboozle) or two
// to four people on one phone with a thumb strip each (/local/bamboozle). Both
// are the same match component; see BamboozleMatch.jsx.

export default function BamboozleDemo() {
  return <BamboozleMatch mode="solo" />
}

export function BamboozleLocal() {
  return <BamboozleMatch mode="local" />
}
