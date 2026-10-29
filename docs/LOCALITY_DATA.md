# Canonical locality dictionary

Movely uses the complete Population and Immigration Authority (PIBA), State of Israel, locality register published on [data.gov.il](https://data.gov.il/he/datasets/population_authority/citiesandsettelments). It is a locality register, not a promise of service coverage, address validation or a statement about administrative boundaries.

The reviewed snapshot is dated **2026-10-25** and contains **1,316 rows and 1,316 unique locality codes**. Every row has a Hebrew name; four have no English name. Codes range from 7 to 9800. The snapshot has no code-zero or unknown/no-settlement sentinel, so **no records are excluded**. Real communities, including entries marked as tribal settlements in the official source, are retained. A future nonpositive code causes import failure and requires review; it must not lead to broad exclusion rules.

## Source and attribution

- Publisher: רשות האוכלוסין וההגירה — Population and Immigration Authority, State of Israel.
- Dataset ID: `3fc54b81-25b3-4ac7-87db-248c3e1602de` (`citiesandsettelments`).
- Resource ID with English column headers: `8f714b6f-c35c-4b40-a0e7-547b675eee0e`.
- [Dataset metadata API](https://data.gov.il/api/3/action/package_show?id=citiesandsettelments).
- [Complete official JSON source](https://data.gov.il/api/3/action/datastore_search?resource_id=8f714b6f-c35c-4b40-a0e7-547b675eee0e&limit=10000).
- Required source fields: `city_code` (numeric), `city_name_he` (text), `city_name_en` (text). Administrative region, bureau and council fields are retained only in the archived original source, not returned by the product endpoint.
- Resource modification reported by the source: `2026-10-25T01:30:28.575193`; dataset modification: `2026-10-25T01:30:42.790180`. These source values do not specify a timezone and are preserved as reported.
- Download time: `2026-10-29T16:30:56.509183+00:00` (UTC).

The source's CSV URL returned HTTP 403 during this import. The official datastore JSON API returned the full 1,316 records and is archived without changing its bytes. No unofficial mirror is used. The original CSV URL remains in the manifest for provenance.

The dataset's license metadata is `other-open`, with no separate license URL. The [data.gov.il terms and data license](https://data.gov.il/he/terms-of-use), page updated 2025-08-30, allow copying, technical transformations, derivatives and commercial use, subject to their conditions. Preserve source attribution, do not imply government endorsement, and do not misleadingly alter or present the data. The data are supplied as-is; continued availability and a particular format are not guaranteed. This is a summary; the linked license governs. Keep this attribution with redistributed snapshots and provide a source link where the dictionary is presented in the product.

## Versioned artifacts

Files are in `apps/api/src/Movely.Api/Modules/Localities/Data/`:

- `localities.piba.2026-10-25.source.json`: original complete government API response. SHA-256: `ea4b59ed442e95de70e1e1bed42a14434395fa7b905c8bac0901491cf7934a96`.
- `localities.piba.2026-10-25.json`: deterministic projection ordered by numeric code, containing canonical Hebrew names and official English aliases. SHA-256: `5eeaa35474b6327de57bad5ff367a2c3b9739d4e1d8d65d18c97ea28fc6fc9a0`.
- `localities.piba.2026-10-25.manifest.json`: source URLs, publisher, resource ID, source modification values, UTC download time, license reference, checksums, row counts and exclusions.

Only the compact catalog and manifest are embedded in the API assembly. The original government response stays in the repository for offline provenance checks; it is not runtime data. The catalog loads locally and validates its checksum, record count, identifiers and aliases at service registration. It performs **no runtime HTTP requests**. A missing or corrupt catalog stops startup instead of silently serving a partial dictionary.

The snapshot JSON files are marked `-text` in `.gitattributes` so Git preserves their exact bytes on Windows and Linux. Do not apply automatic line-ending conversion or formatting to checksum-pinned files without regenerating and reviewing the manifest.

## Lookup and HTTP contract

`ILocalityCatalog` exposes `IReadOnlyList<LocalityDto> All`, `FindByCode(string)` and `ResolveName(string?)`. `LocalityDto` contains only immutable string `Code` and Hebrew `Name`. Numeric source codes become invariant strings without leading zeroes: code 7 is `"7"`, not `"0007"`. Code lookup accepts only the exact canonical identifier.

`GET /api/v1/localities` is anonymous and returns the entire array of `{ "code": "4000", "name": "חיפה" }` objects. It contains no user data, English aliases, administrative metadata or source documents. The API's existing `Cache-Control: no-store` policy applies.

Name lookup normalizes Unicode to NFC, trims outer whitespace and collapses internal Unicode whitespace to one space. Comparison is ordinal and case-insensitive, allowing official English aliases such as `HAIFA` to match `Haifa`. Punctuation is preserved. There is no substring search, prefix extraction, fuzzy matching, transliteration, punctuation deletion or inference from a phone/address/comment. Inputs longer than the existing city field's 120-character limit, malformed Unicode, non-whitespace controls and format controls are rejected. Unknown names return `null`; **never return the submitted free text as a display fallback**. Only `Name` from a resolved dictionary record is safe for a marketplace locality field.

Four official English aliases are ambiguous and deliberately return `null`: `ABU QUREINAT` (1342/968), `KHAWALED` (986/1321), `TARABIN AS-SANI` (970/1346), and `ZOHAR` (1136/44). Their distinct official Hebrew names and codes remain available. An ambiguous normalized name stays unresolved regardless of input row order. For example, `תל אביב` does not match the official `תל אביב - יפו`; the UI must offer the canonical selection rather than silently guessing.

Stage 16 adds nullable `MoveLocation.CanonicalLocalityCode` alongside the private submitted `City`. New snapshots derive it through `ResolveName`. The migration backfills only whole recognized names/aliases using the pinned reviewed snapshot, preserving the original city text and immutable request history. Unknown, ambiguous or decorated values remain null. Marketplace filtering uses the code and display names come only from `FindByCode`; the raw value never becomes a display fallback. A dictionary update must explicitly consider saved codes and migrations pinned to earlier snapshots.

The migration pins **2,620 unambiguous whole-name aliases**, excluding the four ambiguous English aliases across all source names collectively. PostgreSQL normalization uses NFC, the explicit Unicode whitespace code points recognized by .NET, and ASCII case folding with deterministic `C` collation. It preserves punctuation and format/control characters: private suffixes and bidirectional controls do not match. The runtime resolver's `OrdinalIgnoreCase` may recognize additional Unicode case equivalents; SQL deliberately leaves unusual non-ASCII case variants unresolved instead of guessing. The migration requires a UTF-8 database and PostgreSQL 13 or later; CI uses PostgreSQL 17.

Verify the immutable SQL against its pinned source with:

```powershell
python tools/generate_locality_backfill.py --migration apps/api/src/Movely.Api/Data/Migrations/20261029165124_AddCanonicalLocalityCodes.cs --check
```

The generator escapes literals and rejects a changed catalog checksum; a future catalog must not rewrite this historical migration. Indexes cover canonical locality/location type/version, move date, budget with date, and request status with publication time descending and request ID ascending. Their presence is tested on PostgreSQL; actual performance still requires query-plan measurements.

The PostgreSQL backfill test migrates to the preceding schema, seeds every official Hebrew/English name plus private, malformed and ambiguous examples, applies the migration, checks derived codes and unchanged raw text, executes the city/date/budget join, and verifies rollback/reapplication. New-write tests verify that changing a city creates a new projection without changing historical versions.

Before production, measure this schema/backfill/index migration on a staging copy and take a verified backup. It acquires database locks; do not promise a zero-downtime rollout. Stop old-version request writers for the migration/deployment window so they cannot insert an unprojected location after the backfill. Reverting only this migration removes derived codes/indexes while retaining private source text; the marketplace application requires the new schema. Do not downgrade through the separate versioned-consent migration without its documented preflight.

## Reproducible verification and update procedure

From the repository root, Python 3 with only its standard library is sufficient:

```powershell
python tools/import_localities.py
python tools/import_localities.py --refresh --output-dir .tools/locality-import-review
```

The default command is offline: it checks both SHA-256 values and regenerates the canonical bytes from the archived official response. `--refresh` is an explicit network import. It checks metadata before and after the download, the three required field types, `records.length == total`, a bounded expected size, positive unique codes and nonempty Hebrew names. It rejects a partial response, schema/license change or unknown sentinel. It does not overwrite an existing version. Import into an empty review directory when comparing the same source version.

The publisher does not specify a fixed update schedule. The project procedure is to check before release and review monthly thereafter; this document does not create a scheduled job. Compare additions, removals, renames, code changes and alias ambiguities against the pinned snapshot. Review license changes and the meaning of any sentinel; never accept an unexplained reduction or remove unfamiliar communities. Preserve old versions in Git history and decide how renamed/retired codes affect saved requests before activating a new snapshot.

After review, replace the packaged snapshot files, update `LocalityCatalog.SnapshotVersion`, the pinned counts/checksums in `LocalityCatalogTests`, this document and source attribution. Run offline verification, locality API tests and the full API suite. Do not fetch updates on application startup or automatically replace a failed download with a smaller list.
