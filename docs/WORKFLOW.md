# Working in this repository

This repo is written to by the builder, not by hand — but knowing what the
builder is doing makes the commit history far easier to read, and there are a
few things worth doing by hand.

## What each commit means

| Commit message | What happened |
|---|---|
| `Save <slot>: …` | Someone saved a version. The model, its textures and a changelog entry, in one commit. |
| `Release v…: …` | Someone exported. The built artifacts plus a changelog entry, immediately before the release was cut. |
| `Apply preset …` | A preset moved from `preset/` to `preset/applied/`. |

A save is always a single commit on purpose. A half-written save — the model
committed but not its textures — would load into the builder looking fine and
export a pack with missing artwork, which is the kind of failure nobody
notices until someone else installs it.

## Reading a diff

`saves/<slot>/project.json` is the whole add-on, pretty-printed with two-space
indentation and sorted by nothing in particular — the node order is the order
they were created. A diff on it is genuinely readable: adding a block is a
block-shaped addition, and changing a hardness value is one line.

The one thing that will not diff usefully is `assets/*.png`. That is the nature
of binary files, and it is why textures live in their own files rather than
being embedded in the model.

## Rolling back

Because a save is one commit, reverting one is one `git revert` — and the
builder will load the previous state on its next **Versions → Open**. There is
no separate undo history to keep in step.

To go back further than the last save, check out the older `project.json` onto
the branch and let the builder read it:

```bash
git checkout <commit> -- saves/main/project.json saves/main/assets
git commit -m "Roll main back to <commit>"
```

## Deleting a release

A GitHub release owns its tag, so deleting the release is not enough to be able
to re-publish under the same name — the tag has to go too:

```bash
gh release delete v1.2.0-alpha.3 --yes
git push --delete origin v1.2.0-alpha.3
```

The builder will not overwrite an existing tag. If it finds one, it says so and
asks you to bump the pack version instead, which is almost always the better
answer: a build that has been downloaded should not change under the same name.

## Branches

The builder writes to whichever branch Settings names, so a branch is a
perfectly good way to try something without disturbing `main` — point Settings
at it, work, and merge when you are happy. Save slots do a similar job inside
one branch; use whichever suits how you think.
