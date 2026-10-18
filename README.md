# Roadmap_advanced

## Akatsuki · location (R033)

Roadmap never reads GPS and never asks for location permission. It reads where you are from the hub (`hub.whereNow()`, `hub.visits()`), every 60 s while Roadmap is in the foreground — nothing in the background.

**Freshness.** Location comes in the background from the phone (OwnTracks → hub), plus Akatsuki/Cost while one of them is open. Background reports can be up to 15 min apart, so the hub counts a visit as current for 20 min. If the phone agent is off and neither app is open, nothing is recorded: the place is shown as *unknown* — or, for 30 min after the hub last saw you, the last place (open or closed visit alike).

**Override.** The "At" pick on Home still wins for 2 hours after you choose it. Choosing "anywhere" is a pick too (no place filter, for 2 hours). Choose "auto (hub)" to hand it back to the hub. The line beside it says where the place came from: *you picked*, *from hub, N min ago*, *seen N min ago* (last place, no current report), or *unknown*.
