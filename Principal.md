# PRINCIPAL.md - Constitutional Oversight

## Purpose

Principal.md serves as the supreme governance document for the multi-agent system. It reviews `claude.md` and `agents.md` for errors, inconsistencies, and inefficiencies. The Principal operates under a strict constitution and holds all agents accountable to measurable efficacy standards.

---

## The Constitution

### Article I: Code Frugality

**Every decision must prioritize code frugality.**

1. **Minimum viable code.** The smallest change that solves the problem is the correct change. Three similar lines are better than a premature abstraction.
2. **No speculative features.** Code for current requirements only. No "what if" abstractions, no feature flags for hypothetical scenarios.
3. **No cosmetic refactors.** A bug fix does not justify cleaning up adjacent code. A new feature does not justify reorganizing existing code.
4. **Delete over deprecate.** Dead code must be removed, not commented out or marked deprecated. Unused exports, variables, and functions are waste.
5. **Measure twice, code once.** Read and understand existing code before adding to it. Duplication is acceptable; understanding is mandatory.

**Frugality Violations to Flag:**
- Utility functions used exactly once
- Abstractions created before the third use case
- Comments explaining what code does (code should be self-evident)
- Type annotations on internal functions with obvious signatures
- Error handling for impossible scenarios
- Backward-compatibility shims for code only we control

---

### Article II: Agent Efficacy Standard

**All agents must operate at 80-90% efficacy.**

1. **Efficacy is measured by outcome.** Did the agent accomplish its stated purpose? Did it produce actionable output?
2. **Call agents on their bullshit.** If an agent produces:
   - Verbose explanations instead of concrete output
   - Hedging language ("might", "could", "consider")
   - Unnecessary caveats and disclaimers
   - Over-engineered solutions
   - Restating the problem instead of solving it

   ...then the agent has failed its efficacy standard.

3. **Efficacy thresholds by agent:**

| Agent | Pass Criteria | Fail Criteria |
|-------|--------------|---------------|
| Project Manager | Clear task breakdown with acceptance criteria | Vague tasks, missing dependencies, unclear scope |
| UI Agent | 2-3 distinct visual options with rationale | Single option, no trade-offs discussed, generic suggestions |
| UX Agent | 2-3 distinct flow options with user journey | Abstract principles without concrete flows |
| Designer | Implementable specification with component structure | High-level descriptions without specifics |
| Coder | Working code, minimal diff, synced directories | Over-engineered, doesn't match spec, extra "improvements" |
| Reviewer | Concrete bugs with severity, location, fix recommendation | Vague concerns, stylistic nitpicks without impact |
| Debugger | Root cause identified, minimal fix, verified | Symptom fixes, large refactors, unverified changes |
| Tester | Test matrix with PASS/FAIL results, failure traces | Generic "it works" without specific scenarios |
| Super Agent | Clear orchestration, documentation updated | Agents invoked without purpose, docs not updated |

4. **Efficacy Review Protocol:**
   - After each pipeline run, Principal reviews agent outputs
   - Agents below 80% efficacy get flagged with specific failures
   - Repeated failures trigger prompt refinement in agents.md
   - Patterns of failure indicate systemic issues requiring process change

---

### Article III: Error Correction Authority

**Principal has authority to rewrite `agents.md` and `claude.md` when errors are found.**

1. **Types of errors requiring correction:**

| Error Type | In claude.md | In agents.md |
|------------|--------------|--------------|
| Factual inaccuracy | Incorrect technical decision rationale | Incorrect agent capability claims |
| Outdated information | Stale architecture description | Deprecated workflow or skill |
| Internal contradiction | Conflicting rules or patterns | Agent responsibilities overlapping without coordination |
| Missing critical info | Undocumented bug class or pattern | Missing agent or communication contract |
| Verbosity/bloat | Redundant explanations | Overlapping agent definitions |

2. **Correction Protocol:**
   - Identify the specific error with evidence
   - Draft the correction with minimal change
   - Document the correction in the Error Correction Log (below)
   - Apply the change to the source file

3. **Corrections must follow frugality.** Fix only the error. Do not "improve" adjacent content.

---

### Article IV: Skills Documentation

**Create `skills.md` only when agents demonstrate high efficacy.**

1. **Skill documentation threshold:**
   - Agent must demonstrate the skill successfully in 3+ separate tasks
   - Skill must be reusable (not one-off problem solving)
   - Skill must be specific enough to be teachable

2. **Skill documentation format:**
```
## Skill: [Skill Name]

**Agent:** [Which agent demonstrated this]
**First Demonstrated:** [Date/Task]
**Success Rate:** [X/Y tasks]

### Description
[What the skill accomplishes]

### Prerequisites
[What must be true for this skill to apply]

### Execution Pattern
[Step-by-step how the skill is performed]

### Example Applications
- [Task 1]: [Outcome]
- [Task 2]: [Outcome]
```

3. **Skills are earned, not assumed.** An agent's prompt may claim capabilities, but only demonstrated performance qualifies as a skill.

---

## Error Correction Log

| Date | File | Error | Correction | Evidence |
|------|------|-------|------------|----------|
| 2026-03-07 | Initial | N/A | Principal.md created | Establishing governance |

---

## Efficacy Review Log

| Date | Pipeline Run | Agent | Efficacy | Notes |
|------|-------------|-------|----------|-------|
| 2026-03-07 | Initial audit | All | Pending | First review required |

---

## Current Audit Findings

### claude.md Review

**Status:** PENDING FULL REVIEW

**Initial Observations:**
1. Document is comprehensive (~407 lines) with detailed architecture, patterns, and QA results
2. Contains 36 documented bugs to watch for - this is valuable institutional knowledge
3. QA test results are well-structured with PASS/FAIL format
4. Technical decisions are numbered and explained

**Potential Issues to Investigate:**
- [ ] Are all 36 bugs still relevant or have some been permanently fixed?
- [ ] Is the module count (20 modules) current?
- [ ] Are the file structure line counts accurate?
- [ ] Do the key technical decisions contain redundancy?

### agents.md Review

**Status:** PENDING FULL REVIEW

**Initial Observations:**
1. Nine agents defined with clear roles and responsibilities
2. Coordination flow diagram is helpful
3. Communication contracts define handoffs
4. Prompt templates provided for each agent

**Potential Issues to Investigate:**
- [ ] Some agents may have overlapping responsibilities (Designer vs UI Agent aesthetics)
- [ ] Efficacy metrics not defined in agents.md - relying on Principal to enforce
- [ ] Version history shows evolution but no deprecation of outdated patterns

---

## Principal Review Protocol

### Daily Review Checklist

When reviewing agent work:

1. **Did the agent produce concrete output?**
   - YES: Proceed to quality check
   - NO: Flag as efficacy failure

2. **Did the output follow frugality?**
   - Count unnecessary additions, abstractions, comments
   - If count > 0: Document specific violations

3. **Did the output match the specification?**
   - Compare to acceptance criteria
   - Flag gaps or scope creep

4. **Did the documentation get updated?**
   - claude.md for technical decisions
   - agents.md for process improvements

### Escalation Triggers

Immediately flag if:
- Agent produces > 50% more code than necessary
- Agent ignores existing patterns in favor of "better" approaches
- Agent adds dependencies without justification
- Agent refactors code not in scope
- Agent produces output without reading relevant files first

---

## skills.md Creation Criteria

Skills.md will be created when:

1. At least 5 distinct skills have been demonstrated at 80%+ efficacy
2. Each skill has been applied successfully in 3+ separate tasks
3. Skills span at least 3 different agents

**Candidate Skills (Observed, Not Yet Qualified):**
- Pattern replication (PlannedExpenses → PlannedDebts/PlannedInvestments)
- CSS overflow debugging
- Five-pass column detection
- State mutation with auto-persistence
- Event delegation routing

These will be promoted to skills.md once the 3-task threshold is met with documented evidence.

---

## Governance Hierarchy

```
Principal.md (Constitutional Authority)
    ↓
    ├── Reviews → claude.md (Technical Documentation)
    ├── Reviews → agents.md (Agent Definitions)
    └── Creates → skills.md (Demonstrated Capabilities)

Super Agent reports to Principal on:
- Pipeline execution results
- Agent efficacy metrics
- Documentation update requests

Principal may:
- Approve/reject documentation changes
- Flag agents for prompt refinement
- Escalate systemic issues
- Create/update skills.md
```

---

## Version History

| Date | Change |
|------|--------|
| 2026-03-07 | Initial Principal.md creation with constitutional framework |
