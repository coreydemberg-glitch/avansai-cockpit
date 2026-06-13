# Detective Claude — LOCKED doctrine (calibrated against session 54fb5062)

Locked snapshot of the candidate-qualification reasoning engine after a 4-pass
calibration against session `54fb5062` (MaintainX – Search Engineer, 42 decisions).
**Artifact preservation only** — nothing here is wired to a route or deployed.

## Files (locked)
- `detective-claude-manual-v2-locked-54fb5062.md` — the governing doctrine (§0–§9)
  + §10 additive build path. This is the system prompt Detective runs under.
- `detective-learnings-locked-54fb5062.md` — the standing-tells + recalibration
  layer the manual reads at SESSION_START. The manual is non-functional without it,
  so the two are locked together.

## Final calibration (closing pass)
- agreements **36** · disagreements **5** · regressions **0** · TODO **1** (scored 41/42)
- The 5 disagreements (CBC, Geotab, Coursera, OS-Climate, Karan) are genuine
  company-type / confident-non-fit judgment calls that require the investigation
  step — correctly routed to investigate, not errors. The 1 TODO (Geddy) had no
  card data captured (structurally unscoreable).

## What changed across the 4 passes
1. §6 ordering bug fixed (disqualifier gate now precedes the SCREEN/capability check).
2. Gate tiers separated — HARD gates (consulting-employer, finance-institution,
   contractor, non-IC, offshore-no-Canadian-tenure, wrong-side-of-coin, sales/support
   title) are deterministic; wrong-title self-ID demoted to SOFT.
3. Capability-rescue clause: wrong-title + a contradicting search-family capability
   line → UNCERTAIN (verify); bare title + none → NO.
4. #29 adjudicated NO ("modeling focus" = wrong-side-of-coin), logged to learnings §2.

## Not in this commit (deliberate)
- The SQLite training log + `candidate_assessments` (migration `0009`) — the learning
  substrate, not shipped.
- The calibration record / comparison passes — they remain in `~/Documents/detective-loop/`
  (`rerun_FINAL_54fb5062_comparison.md` et al.).
- No `/api/detective`, no cockpit wiring, no Vercel/prod deploy.

The working copies in `~/Documents/` (`detective-claude-manual-v2.md`,
`detective-learnings.md`) remain the live source of record; these are the locked snapshot.
