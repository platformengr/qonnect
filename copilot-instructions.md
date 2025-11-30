# Copilot Instructions for Qonnect

These instructions define how GitHub Copilot (and AI assistants) should collaborate on the Qonnect VS Code extension project.

---

## 1. General Principles

- **Primary goals**:
  - Build a *large, modular* VS Code extension.
  - Code must be **humanly readable**, **simple**, and **maintainable**.
  - Prefer **small, focused functions** over big, complex ones.
  - Follow **SOLID** and general **Clean Code** principles.
- **Default language**: TypeScript.
- **Target environment**: VS Code extension (Node.js, `vscode` API).
- **Architecture first**: For any non-trivial feature, propose the architecture *before* writing large amounts of code.

When in doubt, **ask for clarification on architectural/structural decisions before implementing**.

---

## 2. Code Style & Function Design

- **Small, focused functions**
  - Each function should:
    - Do **one thing** and do it well (Single Responsibility Principle).
    - Be short enough to understand quickly (roughly ≤ 25 lines is a soft guideline).
  - Prefer:
    ```ts
    if (!isDatabaseConnected()) {
      return connectDatabase();
    }

    return mapDatabaseContent();
    ```
    over large functions with many `if/else` branches and comments explaining complex logic.

- **Naming**
  - Names must be **descriptive and intention-revealing**.
  - Favor verbs that describe outcomes, e.g.:
    - `connectDatabaseIfNeeded`, `loadWorkspaceConfig`, `registerDatabaseTreeView`.
  - Avoid meaningless names (`doStuff`, `handleData`) and over-abbreviations.

- **Branching & control flow**
  - Prefer **early returns** to reduce nesting.
  - Extract complex conditions into helper functions:
    ```ts
    if (isSessionStale(session)) {
      refreshSession(session);
    }
    ```
  - Avoid deeply nested `if/else` or `switch` statements. Split into smaller functions or strategy-style objects where appropriate.

- **Comments**
  - Write code that explains itself via **names and structure**.
  - Use comments sparingly, for:
    - The **why** (business rules, constraints, workarounds), not the **what**.
    - Documenting known limitations or non-obvious behavior.

---

## 3. SOLID and Clean Architecture

### 3.1 SOLID

- **Single Responsibility (S)**
  - Each module/class should have one main reason to change.
  - Example responsibilities:
    - `DatabaseConnectionManager` – manages connections.
    - `QueryService` – executes queries.
    - `TreeViewProvider` – exposes read-only data to VS Code tree view.

- **Open/Closed (O)**
  - Core logic should allow extension without modifying existing code.
  - Use interfaces and well-defined extension points for adding:
    - New database types.
    - New views or commands.

- **Liskov Substitution (L)**
  - If an interface `DatabaseClient` exists, any implementation must behave consistently and not unexpectedly throw or omit behavior.

- **Interface Segregation (I)**
  - Prefer several small interfaces over a single "god" interface.
  - Example: `Connectable`, `Queryable`, `TransactionCapable` instead of one `HugeDatabaseClient`.

- **Dependency Inversion (D)**
  - High-level modules depend on **abstractions**, not concrete libraries.
  - Use dependency injection (constructor or factory) instead of global imports where reasonable.

### 3.2 Layered / Hexagonal-ish Architecture

- Keep **core logic** decoupled from VS Code APIs.
- Use a structure like:
  - `src/core/` – pure business/domain logic (e.g. DB clients, mapping, config).
  - `src/adapters/vscode/` – VS Code specific integration (commands, views, status bar, events).
  - `src/features/` – feature-oriented modules that orchestrate core + adapters (e.g. explorer, query runner).
  - `src/infrastructure/` – factories, persistence, external services.

Copilot must **respect and extend** this layering instead of mixing concerns.

---

## 4. Reuse, DRY, and Abstractions

- **Prefer reuse over duplication**
  - Before adding a new function/module, Copilot must:
    - Look for existing functions, services, or utilities with overlapping responsibility.
    - Consider extracting common logic from similar places into a shared helper.
  - If new code looks similar to existing code, favor **refactoring to a shared abstraction** instead of copy/paste.

- **When to extract a reusable function/component**
  - At least two call sites need similar logic, or a single function is doing multiple logically separate tasks.
  - The extracted function has a **clear, cohesive responsibility** and a good, intention-revealing name.
  - The abstraction **reduces complexity** instead of adding indirection for its own sake.

- **Refactor-first mindset**
  - Before implementing a new feature, Copilot should:
    - Briefly scan related modules for reusable pieces.
    - Propose small refactors (e.g., extracting helpers, normalizing parameters, introducing small interfaces) if they will improve reuse.
  - When adding a new feature on top of messy/duplicated code, prefer **incremental refactors** to enable reuse safely, backed by tests.

- **Avoid over-abstraction**
  - Do **not** introduce generic abstractions that are only used once.
  - Delay highly generic utilities until there is a real second use case.
  - Keep abstractions focused on real, concrete reuse across features.

---

## 5. Project Structure Guidelines

These folders may evolve, but keep the intent:

- `src/`
  - `extension.ts` – main entry point, thin wiring only.
  - `core/` – logic with minimal external dependencies.
  - `adapters/`
    - `vscode/` – anything using `vscode` API.
    - other adapters (e.g. specific DB libraries) as needed.
  - `features/` – group code by feature/use-case, not by technical layer only.
  - `infrastructure/` – factories, implementations of interfaces that talk to real systems.
  - `types/` – shared type definitions when needed.

Rules for `extension.ts`:

- Keep it **thin**:
  - Initialize services/container.
  - Register commands, views, and contributions via dedicated modules.
  - Avoid embedding core logic directly in `activate`/`deactivate`.

---

## 6. Testing Strategy & Coverage

**Goal: at least ~80% test coverage for all functionality.**

- **General rules**
  - Every non-trivial module must have tests.
  - Focus on **core logic** and **features** first; adapters should be covered via integration-style tests where appropriate.

- **Test types**
  - **Unit tests** for `core` and small pure functions:
    - Test behavior, not implementation details.
    - High coverage expectation here (aim for near 100% where reasonable).
  - **Integration tests** for feature flows and VS Code interactions:
    - E.g. a command that triggers a DB query and updates a tree view.

- **Coverage requirement**
  - Configure coverage tooling (e.g. Jest + `ts-jest` or Vitest + `c8`) to measure coverage.
  - Aim for **≥ 80% line and branch coverage** overall.
  - Copilot should:
    - Add or update tests when adding/modifying code.
    - Not introduce large untested features.

- **Testing rules for Copilot**
  - When generating new features:
    - Propose and implement corresponding test files.
    - Update any relevant test utilities or mocks.
  - Prefer deterministic tests; avoid relying on external systems (real DBs) unless explicitly requested.
  - Use fakes/mocks or in-memory implementations where possible.

---

## 7. Implementation Workflow for New Features

For any **non-trivial** change, Copilot should:

1. **Clarify the feature** in 1–2 sentences.
2. **Propose a minimal architecture/design**:
   - Which modules it affects or requires.
   - Interfaces, data flow, and boundaries between `core`, `features`, and `adapters`.
3. **Confirm/adjust** design based on user feedback when the decision is significant (new major feature, new dependency, or architecture change).
4. **Implement in small, reviewable steps**:
   - Create or extend small, focused functions.
   - Keep `extension.ts` thin; delegate to feature modules.
5. **Add or update tests** to preserve ≥ 80% coverage.
6. **Run tests** (or provide test commands) and summarize the impact.

For *very small* changes (typo fixes, tiny refactors), Copilot can skip the formal design step but should still maintain structure and tests.

---

## 7. Dependencies & Tooling

- Prefer **well-known, actively maintained libraries**.
- Avoid heavy frameworks unless agreed upon.
- If introducing a new dependency:
  - Explain **why it is needed**.
  - Consider if a small, local utility function would suffice instead.

Testing stack (to be confirmed/adjusted in the actual project setup, but Copilot should align with it once chosen):

- Recommended stack:
  - Test runner: Jest or Vitest
  - Coverage: built-in coverage from runner (`--coverage`) with a configured threshold of **80%**.

Copilot should not hardcode a different stack; instead, use whatever is present in the repo. If missing, propose a standard minimal setup and wait for approval before introducing it.

---

## 8. Refactoring & Legacy Code

- When touching existing code:
  - Preserve behavior unless refactor is explicitly requested.
  - If code violates the above principles (huge functions, unclear names), consider **small, safe refactors**.
  - Always maintain or improve test coverage when refactoring.

- If a necessary change would be large or risky:
  - Propose the refactor plan first.
  - Split into incremental, test-backed steps if possible.

---

## 9. Communication Expectations for Copilot

- Be concise and **solution-focused**.
- For important design decisions, explicitly mention:
  - Options considered.
  - Chosen option and reasoning.
- Avoid long-winded explanations of basic concepts unless the user asks.

When unsure about a requirement, **ask** instead of guessing—especially for architecture, dependencies, and visible behavior.
