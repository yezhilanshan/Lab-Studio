# Local research refresh · 2026-11-07

The existing owner-private workbench now includes a research atlas, four research-track summaries, the matched Reset experiment, ROMSL stability/proxy figures, skeleton-supervision research and the self-capture plan.

The atlas imports the 69-node SEER retrospective and adds two Obsidian-derived nodes. All 122 referenced paths were checked for existence and SHA-256 recorded. The prior retrospective's inventory of 286 Markdown files is a coverage descriptor, not an independent experiment count. The Obsidian folder contains 80 Markdown files at this snapshot; selected research and acquisition notes informed the additions. This refresh does not claim to have reread every underlying paper or rerun training.

Curated local result and planning snapshots are served as plain text under `/evidence`. Research source files and model artifacts were read only. New editable records use new IDs. Existing database overrides and deletions continue to take precedence over bundled defaults. Schema and access audience are unchanged.

Status distinguishes completed runs from acceptance: Stage1 remains No-Go, G0 failed its strict gate, formal ROMSL C/D remains geometry/Doppler blocked, and proxy D has saturated weights. Source notes retain cohort, seed, protocol and uncertainty limitations. The chart shows experiment-two GT and its matched retraining controls, not the earlier Stage1 GT scores.

The atlas and evidence are a manual dated snapshot. Editing an experiment record does not automatically regenerate atlas summaries; source changes require another reviewed refresh.

## Six original ideas correction

The initial refresh omitted original ideas one and two and did not give idea four a separate entry. A dedicated six-idea catalog now follows the Obsidian numbering: dual-branch Event Query; Semantic-LIF Tokenizer; continuous event state/PSEM; offline Radar-to-Text; segmentation-free latent memory; and CIF/LIF-inspired SAEF with associated ROMSL work. It preserves the distinction between the original Semantic-LIF proposal and the later SAEF experiments. The overview includes six direct entries, while the earlier four status tracks remain as an experimental progress summary.

Eight additional original manuscripts and the existing P1 result receive readable source snapshots. The updated atlas has 73 nodes, 130 source hashes and 17 new editable resource/result records. Original ideas one and two are marked as proposals without attached independent acceptance results. The offline Qwen/HMM/count-Viterbi comparison retains its 482-window protocol and used-subject limitation.

Six-idea validation: all six overview shortcuts, all six selected detail states and six comparison rows were checked in the browser. Each detail retained progress and source links; all eight new manuscript snapshots returned HTTP 200. Idea four retained the 27.18% count-decoder result and subject06 limitation. Desktop and 390px mobile layouts were visually inspected; no page horizontal overflow. TypeScript and the production build passed, and all 130 source hashes were rechecked.

## Six architecture figures

Each original idea now has a separate 1440×900 SVG architecture with input, representation modules, state/control feedback, memory and language output where applicable. They are generated reproducibly by `scripts/generate-architectures.py`; `app/architecture-data.json` records source IDs, scope and asset paths. The idea-three figure explicitly uses the latest PSEM v2.6 design rather than mixing historical Verify and Reset paths. The idea-five feedback loop is within one query only; cross-query LMT inheritance remains undecided. The idea-six full language/memory chain retains its design scope and does not imply that the entire system passed acceptance.

Figures replace the earlier five-step pill strip in idea details. They include full-size viewing, individual SVG downloads and a six-figure ZIP with a scope README. Browser checks verified all six rendered image/source/download correspondences, no overlapping module boxes, no overflowing module text after fixing two long headings, and no 390px page overflow. All six figures were visually reviewed. The ZIP was downloaded through the browser. TypeScript and final production build passed. No original research files, model artifacts, database schema or audience were changed.

Validation: TypeScript no-emit check and production build passed. Browser checks confirmed 71 nodes across 10 groups, query filtering, one terminal-unverified node, native modal open/Escape, 122 source cards, all three figures loaded, source text HTTP 200, and no horizontal overflow at 390 CSS pixels for overview/atlas/source views. A disposable local API record round-tripped the new result/verdict fields and was soft-deleted. Local preview state is excluded from source and deployment.
