# Contributing

## How changes reach main

- Every change comes as a pull request. Direct pushes, force-pushes and deleting `main` are blocked by a repository ruleset.
- A code owner approves each pull request before it merges. Code owners are listed in [.github/CODEOWNERS](.github/CODEOWNERS); later approvers are added there.
- Pushing new commits to a pull request dismisses earlier approvals, and every review conversation must be resolved before merging.
- Release tags (`v*`) can't be moved or deleted once pushed.
