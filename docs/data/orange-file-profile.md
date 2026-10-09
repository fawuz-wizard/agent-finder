# The Orange aggregator/agent file — profile, cleaning and import plan

Steps 1–3 of the Orange meeting of 29 September 2026 (analyse the file, map the fields, clean
and validate). Aggregates only: no identifier, name or personal value from the file appears
here. The original file stays outside the repository and is never committed; its SHA-256 is
recorded in the project notes so imported rows can be traced back to it.

## What the file is

A raw Orange Money user export, one sheet, 100 rows, 79 columns. It is not a curated agent
list: most columns are the operator's own account-management fields (approval levels, KYC
proof types, web logins), and one row repeats the header. 96 rows are agents (`AGNT`), 2 are
sub-aggregators (`SUBAGG`), 1 is the repeated header, 1 is empty.

## Field mapping (meeting step 2)

| Meeting needs | Column(s) in the file | Notes |
|---|---|---|
| Aggregator | `PARENT_USER_MSISDN` (+ `PARENT_FIRST_NAME`, `PARENT_LAST_NAME`) | 3 distinct parents: two with 49 agents each, one with 1. The parents are not rows in the file themselves. `OWNER_ID`/`OWNER_MSISDN` (8 distinct) look like the Orange staff who created the records, not the aggregator. |
| Sub-aggregator | rows with `USER_CATEGORY_CODE = SUBAGG` | 2 rows. Hierarchy to confirm with Orange: aggregator → sub-aggregator → agents, or both directly under the aggregator. |
| Agent | `USER_FIRST_NAME`, `USER_LAST_NAME`, `USER_NAME_PREFIX` | Person, not shop. The file has no shop name. |
| Agent ID | `AGENT_CODE` (6 digits, 97 rows) and `MSISDN` (8 digits, local format) | Both unique. 2 agent codes and 1 MSISDN are malformed. |
| Location | `ADDRESS1` (97 distinct, free text: half are place names, half street addresses), `CITY` (32 distinct, inconsistent), `ADDRESS2`/`STATE` nearly empty | **No coordinates at all.** Every imported agent needs a point from somewhere else before the locator can show them. |
| Region (East/North/West/South) | not in the file — `GEOGRAPHICAL_DOMAIN` is "Orange SL" for every row | Derive from `CITY` through a district → province table, with a manual pass for unmatched values. |
| Status | `ACCOUNT_STATUS` (`Y` 93, `N` 5), `DELETED_ON`, `DEACTIVATION_BY` | Active/inactive maps directly. |
| Balance | absent | Not in the export. |
| Activity | `APR CI`, `APR CO`, `TRNX COUNT` | One month (April) of cash-in, cash-out and transaction counts. About two thirds of agents have zeros. `TRNX COUNT` is fractional for some rows, so it is probably an average, to confirm with Orange. |
| Dates | `REGISTERED_ON`, `CREATION_DATE`, `LEVEL2_APP_DATE` | Stored as spreadsheet serial numbers, not text. Convert on import. |
| Personal data | `DOB`, `ID_NUMBER`, `SSN`, `E_MAIL`, `CONTACT_NO`, `CONTACT_PERSON`, `SEX`, `WEB_LOGIN` | Not needed by the product. Do not import; keep only in the original file. |

## Cleaning and validation findings (meeting step 3)

- 1 repeated header row to drop; 1 empty row.
- 1 MSISDN of 6 digits instead of 8; 2 agent codes that are not 6 digits. Hold for Orange to confirm.
- 5 agents marked inactive (`ACCOUNT_STATUS = N`): import as inactive, never shown to customers.
- 6 rows with no city; `CITY` mixes case ("Bo" and "BO"), contains addresses in a few rows, and uses one value that is a country.
- `COUNTRY` has 9 spellings of the same country; irrelevant to the product, normalise or drop.
- No row has a coordinate, so no imported agent can appear in a 500 m search until it has one.
- `REGISTERED_ON` and `CREATION_DATE` are spreadsheet serials, not dates.
- Regions must be derived; "Orange SL" is the only value in the geography column.

## What this means for the pilot

1. **Registration does not wait for the file.** The dealer registers the venue agents by hand
   with a real location (standing at the shop); the file is a lookup, not a gate. A registered
   agent whose `AGENT_CODE` or MSISDN matches a row is marked as checked against Orange's
   record.
2. **Import brings records, not locations.** Imported agents arrive without a point and stay
   off the customer map until a dealer pins them, on site or from a map. Orange's list of
   cities is enough for the regional view and the Global Report, not for the locator.
3. **Activity baseline.** April cash-in, cash-out and counts give each imported agent an honest
   starting "usually handles" figure where they are non-zero; zeros mean no evidence, not no
   capacity.
4. **Sub-aggregators** need one answer from Orange before the dealer model grows a level.

## Import pipeline (meeting step 8), as it will be built

Orange file → validation report (the findings above, per row) → cleaning rules (drop header
and empty rows, normalise city case, convert serial dates, derive region) → match aggregators
by parent MSISDN → match agents by agent code then MSISDN → create aggregator–agent links →
import into the development database with `verified = true` and no location → dealers pin
locations → agents appear in the locator once pinned and signed in.

The original file is kept unchanged outside the repository; every imported row carries the
file's hash and its row number.
