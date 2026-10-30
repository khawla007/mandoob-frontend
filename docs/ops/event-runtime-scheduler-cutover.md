# Event runtime scheduler cutover

## Checked-in state

- Owner: `netlify.event-runtime`
- Cadence: `*/5 * * * *` (every five minutes, UTC)
- Scheduled function: `netlify/functions/process-event-jobs.ts`
- Internal target: `POST /api/v1/cron/process-event-jobs`
- Activation selector: `EVENT_RUNTIME_SCHEDULER_CUTOVER=event-runtime-only`

The schedule is checked in and its handler is locally verified. Deployment activation is not approved or
verified, so the launch disposition remains blocked. The deployed schedule is fail-closed: it returns without
calling the application unless the selector has the exact value above, Netlify's `URL` is a credential-free
HTTPS origin, and `CRON_SECRET` contains at least 32 characters.

Both custom variables, `CRON_SECRET` and `EVENT_RUNTIME_SCHEDULER_CUTOVER`, must use Netlify's **Functions**
scope and the **Production** deploy context only. Do not expose either variable to builds, deploy previews, or
branch deploy contexts. `URL` is Netlify-managed and is not a custom cutover variable.

The handler uses a 20-second maximum timeout, refuses redirects, does not log the secret, and returns only
`completed`, `unavailable`, or an empty disabled response. The application route independently authenticates
the secret, bounds each worker invocation, and schedules only `scheduledRuntimeConsumers`.

## Local dry-run evidence

Run the dependency-free handler tests; they inject the environment and HTTP implementation and do not call
Netlify, providers, or a deployed application:

```sh
node --import tsx --conditions=react-server --test \
  src/lib/events/netlify-event-runtime-scheduler.test.ts \
  src/app/api/v1/cron/process-event-jobs/route.test.ts
```

The tests prove that there is one checked-in cadence, the target path and owner are exact, invalid or absent
activation inputs perform no request, failures are sanitized, deadlines abort the request, and no legacy or
provider cron route is scheduled.

## Approved deployment cutover (not performed)

1. Inventory deployment-level and third-party schedules. Disable every schedule targeting
   `process-outbound-emails`, `process-outbound-sms`, `process-outbound-whatsapp`, or
   `process-meeting-ai-summaries`; retain evidence that no legacy path can run concurrently.
2. Confirm the deployment's `URL` is the intended credential-free HTTPS origin. Configure a 32+ character
   `CRON_SECRET` with Functions scope in the Production context only, without copying it into source, logs, or
   evidence.
3. Set `EVENT_RUNTIME_SCHEDULER_CUTOVER` to `event-runtime-only` only after steps 1 and 2 are independently
   reviewed. Give it Functions scope in the Production context only. Any other value keeps the scheduled
   function inert and leaves authenticated legacy workers available for a safe rollback.
4. With explicit deployment approval, publish the reviewed commit. Verify that Netlify reports exactly one
   scheduled function with the owner/cadence above and inspect sanitized runtime/queue health.
5. Keep provider-disabled and excluded consumers disabled. This cutover does not approve provider traffic,
   advanced provider matrices, or launch acceptance.

## Rollback

Unset `EVENT_RUNTIME_SCHEDULER_CUTOVER` (or set it to any value other than `event-runtime-only`) and publish an
approved configuration change. The checked-in cadence may still invoke the function, but the handler makes no
application request. Do not reactivate a legacy scheduler without a separately reviewed rollback decision.
