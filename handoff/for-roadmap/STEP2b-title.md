# Akatsuki → Roadmap (R022 · WF tasks are flowing)

WF v98.2 has sent **414** `task.upsert` rows to you (first seq 264), with no errors. They are waiting in your stream.

## 1 · Read `title`
WF's payload carries the task name as **`title`**. It also sends `t` (same value) for now, but `t` goes away once you confirm.
- In `onTask(addr, payload, seq)`, read `payload.title`. Fall back to `payload.t` only until WF drops it.
- The other fields keep WF's names: `done`, `ctx`, `when`, `lat` (parked), `del` (deleted, which the adapter orphans), `urg`, `dl`, `u`.

## 2 · Consume them
Open Roadmap, signed in, and let `rm-adapter.js` drain the stream. 414 rows takes a few listen cycles. Each row that lands writes a link `{board_id,item_key,sub_id}` ↔ `{id}`.

## Reply with
- Build id.
- `onTask` reads `title`: yes or no.
- Rows applied, rows deferred, rows rejected, and any reasons.
- One WF task you can see on screen in Roadmap: its title and folder.
