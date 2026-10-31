# FireX canonical schema (`halt.firex.canonical/1.0`)

One Parquet row per valid source record. Missing source fields stay `NULL`; nothing is invented.

| Column | Type | Source | Notes |
|---|---|---|---|
| `evidence_id` | string | derived | `ev-` + first 24 hex of `sha256(source_sha256 \| byte_offset \| canonical_sha256)` |
| `event_ns` | int64 | `eventtime` | primary UTC time, nanoseconds; scaled if the source uses s, ms or µs |
| `date`, `time`, `tz` | string | same | preserved exactly |
| `time_delta_s` | int32 | derived | `eventtime` minus `date`+`time` read as UTC; `NULL` when 0 |
| `byte_offset` | int64 | derived | start of the line in the source |
| `chunk_id`, `line_in_chunk` | int32 | derived | line = plan base for the chunk + `line_in_chunk` |
| `raw_sha256` | string | derived | first 32 hex of the SHA-256 of the raw line |
| `canonical_sha256` | string | derived | first 32 hex of the SHA-256 of the sorted `key=value` pairs |
| `devname`, `devid`, `vd` | string | same | device |
| `event_type`, `subtype`, `logid`, `level`, `action`, `status`, `reason` | string | `type`, ... | |
| `user`, `ui`, `method` | string | same | |
| `src_ip`, `dst_ip` | string | `srcip`, `dstip` | |
| `src_port`, `dst_port` | int32 | `srcport`, `dstport` | |
| `src_intf`, `dst_intf`, `src_role`, `dst_role` | string | `srcintf`, ... | |
| `src_country`, `dst_country` | string | | |
| `session_id` | string | `sessionid` | never a link on its own |
| `proto`, `service`, `policy_id` | string | | |
| `hostname`, `url`, `category` | string | `hostname`, `url`, `catdesc` | |
| `app`, `app_category`, `app_risk` | string | `app`, `appcat`, `apprisk` | |
| `attack`, `attack_id`, `severity`, `crscore` | string | | `attack_id` is metadata only |
| `virus` | string | | |
| `message`, `logdesc` | string | `msg`, `logdesc` | |
| `sent_bytes`, `rcvd_bytes`, `sent_pkts`, `rcvd_pkts`, `duration_s` | int64 | | |
| `extra_json` | string | unknown fields | sorted JSON; `NULL` when none |

`source_sha256`, `parser_version` and `schema_version` are constant for a run and live in `plan.json`, not in
every row. The API adds them to each `EvidenceEvent` it returns.

## Timestamp quality

Computed by the run, returned on `EvidenceEvent` and `Detection`:

| Value | Meaning |
|---|---|
| `normal` | `eventtime` is usable for ordering |
| `collapsed` | at least `collapse.threshold_records` records share this exact `eventtime` |
| `conflicting` | `eventtime` disagrees with `date`+`time` read as UTC |

The dataset-wide disagreement between `tz` and `eventtime` is recorded once in
`DatasetQualitySummary.timezone_conflict`, not on each record.

## Validity

A record is valid when the line starts with `date=`, the tokens cover the whole line, no key repeats, the core
fields (`date`, `time`, `eventtime`, `tz`, `devname`, `logid`, `type`, `subtype`, `level`) are present, and the
time fields have the expected form. Anything else goes to a `QuarantineSegment`.
