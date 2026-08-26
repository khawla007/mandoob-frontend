# PRO evidence upload quiescence design

## Goal

Close the late Storage-write race and prevent evidence upload and removal reservations from being
active for the same credential at the same time. Preserve resumability, bounded cleanup, private
Storage access, and sanitized client errors.

## Upload write fence

Credential evidence uploads have a 120-second hard deadline. The route passes an `AbortSignal`
through the service-role Supabase client to the actual Storage fetch and races the request against
the same deadline. Timeout returns a sanitized failure while the durable reservation remains for
recovery. A late or ambiguous Storage commit is therefore still named by its reservation path.

## Two-pass cleanup

Migration `0086e` adds a cleanup-pass counter and a retained `cleaned` state. The first claimed
erase never deletes or completes the reservation. Finalization returns it to `cleanup`, records one
completed pass, and sets `cleanup_after` five minutes ahead. The worker cannot claim the second pass
before that time. Because five minutes exceeds the maximum two-minute upload request, the second
erase occurs after upload quiescence. Its finalization creates a `cleaned` tombstone rather than
deleting the row. Both referenced `finalized` tombstones and unreferenced `cleaned` tombstones expire
after 30 days in bounded batches of 1,000.

Storage deletion and either database finalization may be retried after ambiguous outcomes. Each
claim remains limited to 25 paths, retains a ten-minute recovery lease, validates the exact owned
path, and rechecks evidence references. Production SQL never deletes `storage.objects` directly.

## Protocol mutual exclusion

Upload prepare locks the credential row first, then rejects any `prepared` or `recovering` evidence
removal for that credential. Removal prepare locks the credential row before it creates, resumes,
or renews a side-effect-capable removal and rejects any `prepared` or `recovering` upload. Completed
replays remain read-only. Credential-first ordering is shared by both new prepare paths; existing
removal row serialization remains subordinate to that credential lock so opposing prepares cannot
deadlock or both succeed.

## Verification

- A deterministic route/worker test times out and aborts a Storage write, performs the first erase,
  resolves the late write, and proves the later pass erases it and leaves a cleaned tombstone.
- Worker tests prove the first pass cannot report completion and ambiguous erase/finalize outcomes
  stay retryable.
- Live SQL and two-session fixtures prove both cross-protocol prepare directions have one safe
  winner, consistent lock ordering, no deadlock, and no orphaned or unusable lease state.
- The existing upload-reservation fixture runs against the final schema without calling the removed
  legacy cleanup function.
