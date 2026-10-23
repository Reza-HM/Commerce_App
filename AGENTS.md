# Project conventions

## Frontend styling

- Use Tailwind CSS utilities as the primary styling approach for all frontend UI.
- Use plain CSS only when Tailwind utilities and theme configuration cannot
  express the requirement clearly. Keep such CSS small and scoped, and explain
  the reason for the exception.
- Keep shared visual tokens in the Tailwind theme in `apps/web/app/globals.css`.
- Prefer complete, statically detectable utility classes over dynamically
  constructed class names. Preserve responsive behavior and accessibility.

## OpenSpec and Git

- Keep OpenSpec configuration and the repository's reusable OpenSpec skills in
  version control so contributors receive the same workflow after cloning.
- Normally use one short-lived feature branch and one PR per OpenSpec change,
  keeping planning, implementation, validation, and archive records together.
- Small implementation refactors that preserve specification behavior do not
  require rewriting an archived change. Update current conventions where needed.
- These conventions do not relax the user's Git approval or safety rules.
