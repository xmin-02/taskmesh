<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-30 | Updated: 2026-03-30 -->

# docs

## Purpose
Architecture documentation, design decisions, and planning documents for the Taskmesh project. These files describe the system design, runtime model, and container isolation strategy.

## Key Files

| File | Description |
|------|-------------|
| `architecture.md` | System design: session model, delegation flow, Discord layout, storage schema, and build phases |
| `runtime.md` | Deployment plan: services, supervision via launchd, and future isolation options |
| `container-runner-plan.md` | Container execution groundwork: config knobs, host vs docker behavior, next steps |
| `container-auth-review.md` | Provider-by-provider assessment of CLI auth reuse inside containers |

## For AI Agents

### Working In This Directory
- These are reference documents — read them before making architectural changes
- `architecture.md` is the authoritative design doc for the system's data model and flow
- Container docs describe a planned but not fully implemented isolation strategy

### Common Patterns
- Documents follow a structured format: Goal, Summary, then detailed sections
- Phase-based roadmaps (Phase 1/2/3) are used to describe incremental delivery

<!-- MANUAL: -->
