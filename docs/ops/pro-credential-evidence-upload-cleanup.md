# PRO credential evidence upload cleanup

Configure the deployment scheduler to send `POST /api/v1/cron/cleanup-pro-credential-evidence-uploads`
every five minutes with the `x-cron-secret` header set to `CRON_SECRET`. The repository does not
provision an external Netlify scheduler, so this schedule must be installed in the deployment
environment.

Each invocation claims at most 25 expired upload reservations. Claims are leased for ten minutes,
private Storage API deletion is idempotent, and database finalization happens only after deletion.
If storage deletion or finalization has an ambiguous result, the claim remains retryable after its
lease expires. The database rechecks evidence references before claiming and finalizing, so the
worker never intentionally deletes a referenced artifact.

Postgres schedules finalized reservation tombstone retention independently each day. Finalized
tombstones older than 30 days are removed in bounded batches; evidence rows and Storage objects are
not removed by that retention job.
