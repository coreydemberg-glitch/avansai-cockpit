# Detective Claude — LEARNINGS LAYER

*The persistent memory the Manual's feedback loop writes to (Manual v2 §8 / pseudocode `learnings_file`).
SESSION_START reads this alongside `detective-claude-manual-v2.md`. SESSION_END proposes additions here;
Corey approves before they persist. Sections 1 is STANDING doctrine (carries across sessions); 2–4 accrete over time.*

---

## 1. STANDING TELLS — carry across every session
*Seed baseline distilled from the MaintainX Search-Engineer review (2026-06-11). These sharpen — never get cleared.*

**⛔ ENFORCEMENT — two tiers (hardened 2026-06-13; re-tiered after the id-42 regression):**
- **HARD gates = deterministic.** Consulting employer · finance institution · independent contractor · non-IC · offshore-no-Canadian-tenure · wrong-side-of-coin · Sales/Solutions/Support/Specialist title. If one CLEARLY fires → **NO / PASS**, before capability, no override. Ghost-protect spares only a weak/ambiguous one.
- **SOFT signal = wrong-title self-ID** (Architect / Research Scientist / Specialist). REFRAME-ABLE → **CAPABILITY-RESCUE** decides: title + a contradicting capability line (search / semantic-search / vector-DB / embedding / retrieval / relevance) → **FLAG/UNCERTAIN** (verify-by-chat); **BARE title + no capability → NO** (cut the inflation). Never hard-gates pre-capability; never auto-PASSes on the title word. (id-42 had real "vector DB / semantic search" behind the "architect" title → rescued to UNCERTAIN; bare-title ghosts — research-scientist / specialist / software-architect with zero capability — stay NO.)
(See Manual §3a ENFORCEMENT + §6 `map_confidence_to_call`. The first backfill found 16/23 misses were clear HARD gates not enforced at verdict time.)

**Standing label tripwires (reflexive no-research PASS — Manual §3a):**
- Consulting / IT-services employer (verify the real company — LinkedIn mistags consulting).
- Finance INSTITUTION (bank / insurer / asset-manager) — but a fintech PRODUCT company is fine.
- Solutions / Sales / Support Engineer or Product Specialist title ("looks like a salesperson").
- Self-ID as "Architect / Research Scientist / Specialist" instead of Software Engineer/Developer. **(SOFT — reframe-able, NOT a hard gate: FLAG/investigate, capability decides.)**
- Independent contractor / consultant.
- Non-IC (manager / director / VP / CTO / founder), incl. open-to-work box saying "wants Director/Manager."
- Offshore-only history/education with no real Canadian tenure (mystery location under a company = likely offshore).
- "Wrong side of the search coin" for a search/IR role — pure data-science / advanced-analytics / ML-research-only.

**Green-flag tells (lean in):**
- About/headline LEADS with the function → that's their real career direction.
- Built-custom > wired-off-the-shelf ("orgs using Elasticsearch and NOT building their own are usually a step behind"); ICP has done BOTH across multiple environments (the Neil archetype).
- Rehire / boomerang = strong positive (re-brought + promoted = not a real jumper).
- Search-company pedigree (A9, Bing/Satori, Elastic) + intern→FT + strong NA schools (Waterloo).
- Long tenure with a sparse resume → don't penalize; triangulate via the employer's JDs/team to fill gaps.

**Nuance / disambiguation tells:**
- Keyword/skill ORDER = real focus; first listed = core, buried-last = secondary.
- Elasticsearch-for-logging/observability ≠ search engineering.
- Current role must show the capability; if it appears only in PAST roles, weaker.
- "Lists everything" / kitchen-sink profiles trip every Boolean → read carefully, usually not a true specialist.
- Sparseness is NEVER grounds for a PASS (ghost protection — when in doubt, ADD/keep).

**Client-screener reads (two-layer verdict — Manual §5):**
- MaintainX = finicky/literal gatekeeper: rejects capable people on missing keywords → reposition honestly on defensible keywords, then depth wins the room.
- A JD that lists NO languages = the client is leaning function-first (e.g. search-first).
- Cross-company level translation: Staff at a higher-bar shop ≈ Senior at MaintainX (it levels down).

---

## 2. RECALIBRATION LOG
*Append: date · role/client · what Corey corrected · the adjustment Detective made.*
*(Raw rows: `detective-loop/candidate_assessments`, source `transcript:54fb5062`.)*

- **2026-06-11 · MaintainX Search-Engineer · Neil Veira mis-weighting.** Detective's first read leaned ML-heavy and buried the backend/search fit. Corey flipped it: Neil built a CUSTOM search engine *because* off-the-shelf (ES/Lucene) couldn't handle the complexity → he's ABOVE the ES-wirer crowd, not below. **Adjustment:** capability-shape over keyword presence; "built custom > wired off-the-shelf"; ES-on-resume is often logging, not search.
- **2026-06-11 · MaintainX · cards lie, profiles don't.** Of 5 "Tier 1" cards, **3 were actually OUT** (Nishant/LexisNexis-consulting, Sameer/TD-contractor, Sam Shamma/support-title) — the disqualifiers only show on the FULL profile, not the search card. **Adjustment:** never finalize a keep from the card; the card tiers, the opened profile decides. Card-stage model is deliberately too generous (wide net), Corey narrows on the profile.
- **2026-06-11 · MaintainX · the open-to-work box = aspiration.** Alex H. (Mistplay) looked like a keep but his open-to-work box said he wants Director/Manager → intent points away from IC. **Adjustment:** read the open-to-work box for where their head is pointing; a SWE who lists non-SWE aspirations is drifting; a non-SWE who lists "Software Engineer" is worth keeping.
- **2026-06-11 · MaintainX · keyword ORDER = real focus.** Venkat (Qualcomm) had Elasticsearch, but for LOGGING and listed near the END → streaming/platform, not pure search. **Adjustment:** first-listed = core; buried-last = secondary; a "lists everything" profile usually isn't a true specialist.
- **2026-06-11 · MaintainX · finance INSTITUTION vs fintech PRODUCT.** Dow Jones / Vanguard / Intact = cut (institutions); Affirm = keep (fintech product, even as a ghost). **Adjustment:** the cut is the institution, not the word "finance."
- **2026-06-11 · MaintainX · process note from Corey.** "You need volume and case studies — don't re-screen ahead of me." **Adjustment:** Detective accumulates calibration case-by-case and mirrors Corey; it does not run the list ahead of him.
- **2026-06-13 · MaintainX · "modeling focus" = wrong-side-of-coin (#29 specialist adjudication).** On the capability-rescue check, a card whose only signal is "modeling focus" does NOT rescue a wrong-title self-ID — modeling/ML-DS is the wrong side of the search coin, not IC-search work. **Adjustment:** the rescue line must be *search-family* (search / relevance / ranking / IR / semantic / vector DB / embedding / retrieval); ML/modeling/data-science phrasing is a CUT, not a rescue. Corey adjudicated #29 → NO.

---

## 3. SKIP-LOG ARCHIVE
*Append per list run: date · client/role · candidate · one-line PASS reason · which axis fired
(hard-filter / standing-tripwire / fast-skip / company-type / confident-non-fit).*
*(Full rows incl. unnamed cuts: `detective-loop/candidate_assessments` where `corey_call='OUT'`.)*

**2026-06-11 · MaintainX – Search Engineer** (every PASS Corey made on full-profile review):
- Nishant Balasubramanian (LexisNexis) — consulting/IT-services + India-only tenure · standing-tripwire
- Sameer/Samir (TD) — independent contractor + bank history · standing-tripwire
- Sam Shamma (Coveo) — Support/Solutions Engineer title ("salesperson") · standing-tripwire
- Desislava Aleksandrova (CBC) — broadcaster, not a tech-product environment · company-type
- Angad Bashani (Thomson Reuters) — consulting · standing-tripwire
- Kelechi (ServiceNow) — business-transformation = consulting · standing-tripwire
- Alex H. (Mistplay) — DS/ML not SWE + open-to-work wants Director (non-IC) · standing-tripwire
- Gaurav (solutions architect) — not a SWE, independent consultant, non-Canada · standing-tripwire
- (unnamed, Dow Jones) — finance institution · standing-tripwire
- (unnamed, Intact) — insurance / finance institution · standing-tripwire
- (unnamed, advanced-analytics/DS) — wrong side of the search coin · standing-tripwire
- (unnamed, Cloud Geometry) — ML-research, no big-tech, no Canadian degree · confident-non-fit
- (unnamed, Tiger Analytics) — analytics ML, wrong title · confident-non-fit
- (unnamed Research Scientist) — wrong-title self-ID · standing-tripwire
- (unnamed Specialist) — wrong-title self-ID · standing-tripwire
- (unnamed, Geotab) — ML not SWE, ~2 yrs, "gonna get crushed" · confident-non-fit
- (unnamed, Coursera) — ML, wrong side of search coin · confident-non-fit
- (unnamed, Vanguard) — asset manager / finance institution · standing-tripwire
- (unnamed, Thomson Reuters #2) — consulting · standing-tripwire
- Ratan — never self-IDs as software developer · standing-tripwire
- (unnamed, OS-Climate) — unknown/weak org · confident-non-fit
- (unnamed Software Architect) — wrong-title self-ID · standing-tripwire
- Karan (Mobiquity) — no CURRENT search (only past) + weak-tech company · company-type

*Spot-check axis for "too aggressive": standing-tripwire dominates — confirm the consulting/finance/title cuts aren't catching real product builders mislabeled by LinkedIn.*

---

## 4. FLAGGED FOR LATER
*Append: candidate · the interesting signal · RE-ROUTE target role (if a different role is open now) OR PARK.*
*(Raw rows: `detective-loop/candidate_assessments` where `corey_call IN ('REROUTE','PEEK','UNCERTAIN_CONTACT')`.)*

**2026-06-11 · MaintainX**
- **Yubin Liao (Procore)** — platform/streaming + search infra, 15+ yrs Canadian, leadership · **RE-ROUTE → MaintainX streaming role** ("good for something").
- **Venkat Reddy Aredla (Qualcomm)** — really streaming/platform (ES = logging, listed last); Qualcomm/manufacturing overlaps MaintainX · **RE-ROUTE → streaming/platform; contact agnostically.**
- **Jugpreet Talwar (LinkedIn)** — current role maybe-search (PYMK/relevance), unconfirmed; big-tech + promotion + just relocated · **PARK/contact** — resolve "is current role search?".
- **(unnamed Unity-rehire)** — lots of search + rehire but confusing profile (Unity date overlap) · **PARK — worth a phone call.**
- **(unnamed, Firework, ghost)** — prior search at Unity · **PARK — peek.**
- **(unnamed ML eng, Infosys/SAP/Barclays/Swiggy)** — "vector DB + semantic search + embedding" word-for-word off the JD, but kitchen-sink + architect self-ID · **PARK — worth a chat.**
- **(unnamed staff dev, Loblaws)** — "probably not good enough, but I'll look" · **PARK — soft peek.**

*Note: the MESSAGE/SCREEN keepers (Mayya, Adam, Tatsuya, Brian, Amandeep, Chauncey, George, Ramya, Chris N.) are live screens, not "for later" — they live as `corey_call='MESSAGE'` rows in the log, not here.*
