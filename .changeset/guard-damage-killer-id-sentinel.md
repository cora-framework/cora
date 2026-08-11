---
"@cora-framework/core": patch
---

Guard the CyberMP adapter's `damage` event mapping against an unverified "no attacker" `killerId` sentinel: log a deduplicated warning when `killerId` equals the target's id or is negative, instead of silently forwarding a possibly-wrong value with no visibility. The mapping still forwards `killerId` unchanged; no throw is introduced. RFC 0001 and the README now note that `onDamage`'s no-attacker representation is unverified against a live server, unlike `onPlayerDeath`'s reliable `null` semantics.
