# MFA factor removal reservations

Privileged MFA removals use one durable reservation per user. The reservation has no automatic
expiry: expiring a lock while an old request can still resume would permit two Auth mutations.

Normal success and known failures release the reservation. A process crash may leave one behind,
causing later removals to return `MFA_MUTATION_IN_PROGRESS`. Before manually deleting a stale row,
an operator must confirm that no request from the deployment that created it can still run and must
inspect the user's current verified factors. Keep at least one verified factor for admin,
super-admin, and PRO users.
