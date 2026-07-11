# viaim Design debranding and defaults QA

## Sources

- Removal reference: `/Users/Eric Don/Desktop/Screenshot 2026-07-11 at 4.05.42 PM.png`
- Full desktop implementation: `/Users/Eric Don/Documents/AI Work Processing/Coding.nosync/Codex/Open Design 兼容 VD 2.0 项目/.tmp/viaim-design-home-final-flat.png`
- Focused before/after comparison: `/Users/Eric Don/Documents/AI Work Processing/Coding.nosync/Codex/Open Design 兼容 VD 2.0 项目/.tmp/team-removal-comparison-final.png`
- Runtime: desktop namespace `vision-design-run`, web `http://127.0.0.1:17573`, daemon `http://127.0.0.1:17456`.

## Viewport and state

- Reference: 198 x 122 supplied crop, light header state, Team pill visible.
- Implementation: 2560 x 1800 Retina desktop capture, Home active, Simplified Chinese, light theme.
- Focused implementation crop: 400 x 244 from the same desktop header; the reference was centered into a matching 400 x 244 comparison cell because no full reference viewport was supplied.
- The comparison is a removal target rather than a pixel-match target: the expected implementation state is the same header area without the Team pill.

## Full and focused comparison

- The application title and Home hero now read `viaim Design`.
- The Home header keeps the existing local execution and settings controls; GitHub Star, Team, and Discord marketing controls are absent.
- The focused side-by-side comparison confirms the supplied Team pill is removed without leaving a duplicate control or layout collision.
- The final capture remains in the existing compact Open Design-derived visual system: semantic colors, light surfaces, current spacing, radius, typography, and shared controls were preserved.

## Findings, fixes, and iteration history

- First pass removed only the requested Team/marketing surfaces. Full-screen review then exposed a remaining hardcoded `Open Design` Home-hero label; it was changed to the localized `app.brand` value and recaptured as `viaim Design`.
- Removed the Home GitHub/Team/Discord controls, compact settings duplicates, left-rail Help launcher, desktop Help marketing links, About release link, privacy GitHub link, social tips, Discord feedback links, and official bundled-plugin links back to the upstream repository.
- Removed the unused Team URL helper, Star/Discord hooks, and their isolated UI files/tests so the removed links are not still mounted or fetched in the background.
- Removed the Plugins Team placeholder tab and the Design Systems Enterprise placeholder scope while preserving ordinary marketplaces, installed/available/source tabs, personal systems, and official presets.
- New installs now resolve to Simplified Chinese and light mode. A manual saved locale or explicit saved `system`/`dark` theme remains authoritative.
- The pre-hydration theme script applies light when no preference exists, preventing an operating-system dark preference from flashing a fresh install dark.
- While inspecting Settings → About, a retained React event caused the silent-update checkbox to throw. The checked value is now captured before the state updater runs, and a focused regression test covers it.

## Interaction verification

- Desktop status: running and visible, title `viaim Design`.
- Home DOM: `lang=zh-CN`, `data-theme=light`, brand `viaim Design`.
- Home header: `entry-workspace-teams`, `entry-discord-badge`, and `entry-star-badge` all absent.
- Quick settings popover: language, appearance, and full settings remain available; the popover contains zero anchor elements and no Team entry.
- Plugins: visible tabs are `已安装`, `可用`, and `来源`; no Team tab.
- Design Systems: `你的体系` and `官方预设` remain; no Enterprise tab or Coming Soon placeholder.
- Existing Vision Design first-level routes remained available in the same rail.

## Tests and console

- Web TypeScript: passed.
- Desktop TypeScript and build: passed.
- Focused Web tests: 13 files, 320 tests passed; the additional silent-update regression test passed independently.
- Desktop window-chrome tests: 1 file, 5 tests passed.
- `git diff --check`: passed.
- Root `pnpm guard`: blocked before project checks by the pre-existing tracked deletion of `packages/contracts/src/design-systems/token-schema.ts`; this task did not restore unrelated workspace deletions.
- Fresh desktop console after restart: React DevTools info, HMR connection, and the expected development-only Electron CSP warning; no application errors.

## Final result

passed
