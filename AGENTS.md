# Agents

TobyVerse chat voice (request-first, no forced lesson format) is defined in [`docs/mindset.md`](docs/mindset.md). Any model editing prompts must follow that file and must not add always-on teaching rituals. Runtime copy: `lib/ai/voice.ts`.

For regressions, trace the full data path, compare the last working commit, and check authoritative implementation guidance where relevant before changing behavior. Reproduce the reported scenario in a focused test and verify the complete path after the fix.
