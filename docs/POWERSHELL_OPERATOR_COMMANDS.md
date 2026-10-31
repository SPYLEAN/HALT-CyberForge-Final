# PowerShell operator commands

> Claude does not run the complete datasets. These are for the operator to run. Each result needs its own
> receipt; nothing here is a measured figure until the commands have been run.

Run from `services\api` in the repository, with the virtual environment's Python.

```powershell
$env:HALT_FIREX_DATA_ROOT = "C:\HALT-DATA"
$py = ".\.venv\Scripts\python.exe"
```

## HALT 10G ingestion and reconstruction

```powershell
& $py -m halt.firex run --dataset firex-10g
```

## HALT 30G ingestion and reconstruction

```powershell
& $py -m halt.firex run --dataset firex-30g
```

## Options

`--workers N` sets parser processes (default: logical CPUs minus one, at most 8). `--memory-limit-gb N` sets the
DuckDB limit (default 4). Worker count changes speed only, not the result.

## Memory monitoring

In a second window, while a run is active. It samples the runner and its workers together:

```powershell
while ($true) {
  $p = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*halt.firex*" -or $_.CommandLine -like "*multiprocessing*" }
  $mb = (($p | ForEach-Object { (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).WorkingSet64 } | Measure-Object -Sum).Sum) / 1MB
  "{0:u}  processes={1}  working_set_mb={2:N0}" -f (Get-Date), @($p).Count, $mb
  Start-Sleep -Seconds 10
}
```

## Status

```powershell
& $py -m halt.firex status --dataset firex-10g
```

## Restart and recovery

Stop a run, then continue it. Finished chunks are not repeated:

```powershell
& $py -m halt.firex cancel --dataset firex-10g
& $py -m halt.firex run --dataset firex-10g
```

To test a hard stop, end the runner process with `Stop-Process`, then run the same `run` command.

## Deterministic replay

Rebuilds detections and incidents from the stored parts, keeps a copy of the previous incidents folder, and compares graph hashes with it:

```powershell
& $py -m halt.firex replay --dataset firex-10g
```

## Incident-open latency

```powershell
& $py -m halt.firex latency --dataset firex-10g
```

## Receipt verification

```powershell
& $py -m halt.firex verify --dataset firex-10g
```

## App startup

From the repository root:

```powershell
$env:HALT_FIREX_DATA_ROOT = "C:\HALT-DATA"
npm run dev
```

Open `http://localhost:3000/firex`.

## Independent validation

Runs outside the product. These are profile candidates, not organiser ground truth. Replace `<run_id>` with the id the run printed:

```powershell
& $py -m validation.firex_validator --run-dir "C:\HALT-DATA\results\firex-runs\<run_id>" --candidates "C:\HALT-DATA\results\firex-10G-profile" --out "C:\HALT-DATA\results\firex-validation-10g"
```

## Results location

`C:\HALT-DATA\results\firex-runs\<run_id>\`, including `benchmark_receipt.json`.
