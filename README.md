# Roadmap_advanced

## Akatsuki · location (R033)

Roadmap never reads GPS and never asks for location permission. It reads where you are from the hub (`hub.whereNow()`, `hub.visits()`), every 60 s while Roadmap is in the foreground — nothing in the background.

**Freshness.** Location comes in the background from the phone (OwnTracks → hub), plus Akatsuki/Cost while one of them is open. Background reports can be up to 15 min apart, so the hub counts a visit as current for 20 min. If the phone agent is off and neither app is open, nothing is recorded: the place is shown as *unknown* (or the last place, marked stale, for 30 min after you left it).

**Override.** The "At" pick on Home still wins for 2 hours after you choose it. Choose "auto (hub)" to hand it back to the hub. The line beside it says where the place came from: *you picked*, *from hub, N min ago*, *left N min ago, stale*, or *unknown*.
