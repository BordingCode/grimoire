# Phase 4 — Character Linking (cloud sync) design

Mathias's feature: link 2+ characters and choose **per-parameter** what's shared, so
a character can be shared/handed-off (you + partner can't play at the same time) or a
"shape-shift" can share physical stats but not mental ones. Sync = **Cloudflare backend
+ shared link code**, **newest-wins** (players never play simultaneously).

> Approve the approach below before building. The Worker deploy touches Mathias's
> Cloudflare account, so it waits for a session where he's present.

## Parameter groups (what can be linked)
Toggle each group on/off per link:
- **Physical** — HP (cur/max/temp), hit dice, death saves, conditions, AC/armor, speed
- **Resources** — spell slots used, pact, resource trackers (Rage/Ki…)
- **Mental** — ability scores, saves, skills, prepared/known/favorite spells, spell DC/attack
- **Identity** — name, class, level, edition, portrait, notes
- **Gear** — inventory, currency

Default for "shared character, alternating players": all groups on.
Default for "shape-shift": Physical + Resources + Gear on; Mental + Identity off.

## Data model additions (on a character)
```
link: {
  code: "ABCD-1234",        // shared secret = the channel id
  role: "owner"|"member",
  groups: { physical:true, resources:true, mental:false, identity:false, gear:true },
  lastPulledVersion: 0,
  lastPushedAt: null
}
```

## Backend (Cloudflare Worker + KV or D1)
One row per link code: `{ version, updatedAt, updatedBy, payload }` where payload = the
subset of character fields for the **enabled groups** (sender's view; each device merges
only the groups IT has enabled).
- `POST /link/:code` → store payload, `version++`, return new version. (newest-wins; no merge)
- `GET /link/:code?since=N` → return payload if `version > N`, else 304-style empty.
- Code is the only auth (long, random, hyphenated). Rate-limit per code.
- Free tier: Workers + KV is well within free limits for a few players.

## Sync flow (newest-wins, conflict-free because no simultaneous play)
- **On change** (debounced) → build payload from enabled groups → POST.
- **On app open / sheet open / pull button** → GET ?since=lastPulledVersion → if newer,
  merge enabled groups into local character, set lastPulledVersion.
- Show "Last updated by <name> · <relative time>" + a manual Pull button.
- Never auto-overwrite while the user is mid-edit; pull on open and on demand.

## UI
- Char menu → "Link with another player":
  - Create link (generates code) OR join with a code.
  - Group toggles (the table above) with the two preset buttons.
  - Status line + Pull now + Unlink.

## Build steps (next session)
1. Confirm groups + defaults with Mathias.
2. Write `worker/grimoire-sync.js` + `wrangler.toml`; `wrangler deploy` to his account
   (token ~/.cloudflare-token; account = memory reference_cloudflare_account).
3. Frontend `js/link.js`: payload build/merge by group, POST/GET, debounce, status.
4. Linking modal UI + char-menu entry.
5. Test with two browser profiles against the deployed Worker; verify newest-wins + group filtering.
