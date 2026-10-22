Auth feature (Stage 7/10): demo PIN login when `VITE_AUTH_MODE=demo`.
Nobody chooses a role at sign-in: the number decides (agent code or agent line → Agent App,
aggregator line or id → console) and the server is the authority; `role` is only a legacy hint.
The browser never receives a server key; sessions are bearer tokens checked by the API.

First sign-in: the one-time code the aggregator (or the team) read out works once. It opens
`/choose-pin` (`ChoosePinPage`) and nothing else: `RequireRole` sends a session marked
`must_set_pin` there, and the API shuts every other route with `pin_required`. The PIN chosen
there replaces the code; `pinChosen()` on the session context settles the stored session.
