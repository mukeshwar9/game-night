// Pure part of "Delete my data": which database paths hold a user's rows.
// Each path is deleted individually (null) because the rules allow owners to
// delete their children (friends/{uid}/{friend}, friendRequests/{uid}/{from},
// invites/{uid}/{id}) but grant no write at the parent level.

// friendUids / requestUids / inviteIds come from reading the account's own
// nodes first; `code` from users/{uid}/code.
export function deletionPatch(uid, { friendUids = [], requestUids = [], inviteIds = [], code = null } = {}) {
  if (!uid) return {}
  const patch = {}
  for (const friend of friendUids) {
    patch[`friends/${uid}/${friend}`] = null
    patch[`friends/${friend}/${uid}`] = null
  }
  for (const from of requestUids) patch[`friendRequests/${uid}/${from}`] = null
  for (const id of inviteIds) patch[`invites/${uid}/${id}`] = null
  if (typeof code === 'string' && code) patch[`codes/${code}`] = null
  patch[`profiles/${uid}`] = null
  patch[`presence/${uid}`] = null
  patch[`funnelSeen/${uid}`] = null
  return patch
}

