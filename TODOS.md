# TODOS

## Platform

### Read access for Orange's analysts to the network data

**What:** A read-only report or API that gives Orange's own analysts the registry (agents, aggregators, confirmed pins, status age) and the aggregated unmet-demand figures (share of searches per 500 m cell that found no open shop, cells under the reporting minimum omitted).

**Why:** The aggregator console and the Global Report serve the people who run agents day to day. Orange's planning side asks different questions of the same data (where to add agents, where float runs short) and should not need a console login to ask them.

**Context:** Parked during the 2026-10-22 review as platform potential. The Global Report and the CSV exports already exist under the aggregator's profile; the unmet-demand column depends on the search-event record (500 m cell, hour, request type, count of open shops found; no identity), which is designed and not yet built. Start from the report's query layer, not a new surface. Picture first, as every screen.

**Effort:** M
**Priority:** P3
**Depends on:** The search-event record; the pilot live for at least four weeks; a data-handling agreement with Orange.

### Other operators' agents on the same map

**What:** Register and show agents of a second mobile-money operator alongside Orange's, with the same registry rules (aggregator-confirmed pins, status from activity, words not money).

**Why:** A customer who needs cash cares about the nearest working agent, not the brand; a map that shows one operator answers half the question.

**Context:** Parked during the 2026-10-22 review. The data model keys agents by MSISDN and agent code and has no operator field; the import pipeline is written for Orange's file layout. Conflicts with any exclusivity Orange may ask for, so it waits for the commercial conversation. Not before the Orange pilot has run.

**Effort:** L
**Priority:** P4
**Depends on:** The Orange pilot's outcome; no exclusivity clause; a second operator's agent list.

## Completed
