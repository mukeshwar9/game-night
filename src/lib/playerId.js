export function getPlayerId() {
  let id = localStorage.getItem('playerId')
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))
    localStorage.setItem('playerId', id)
  }
  return id
}
