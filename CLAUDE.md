# Engineering Rules & Guidelines

## Code Quality & Architecture
- Never write or modify code unless you fully verify the connections and data invariants.
- Map both sides of every bridge before refactoring or changing components. Ensure there are tests in place to avoid regressions.
- Match the surrounding code style, formatting, and documentation conventions.
- Do not add unnecessary boilerplate or generic comments; leave documentation only where logic is non-obvious.

## Tech Stack & Constraints
- Clean simple styling and include mobile responsiveness.
- Avoid inline styles; use the established design system or CSS/Tailwind classes.
- Specify exact field types, constraints, and relationships when creating new data models or tables.

## Workflow & Verification
- State your goal, the level of effort required, and a verification plan before executing.
- Run relevant unit tests or type-checks to verify your changes before reporting completion.
- Ask clarifying questions if the requirements or side effects are ambiguous. Actively flag areas of ambiguity and ask for guidance instead of assuming.
