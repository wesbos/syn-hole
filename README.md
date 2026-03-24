## Realtime Conference Polling

Cloudflare Workers + PartyServer sample for live conference polling with three views:

- `Audience`: answer the active multiple choice question
- `Host`: control question flow, voting, and reveal
- `Projector`: display live aggregated results

Questions are defined in `src/data/questions.json`, while correct answers remain server-only until reveal.
