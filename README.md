# plants-and-foods

The **project repository** for an add-on built with
[Minecraft-web](https://github.com/manukmiber/Minecraft-web) — the visual
builder. This repo holds the add-on's *data*: its save slots, the presets
waiting to be applied, its changelog, and every build that has been exported.

The builder itself lives in the other repo. This one has no code in it, and
that is the point: **there is no database.** A save slot is a JSON file, a
texture is a PNG next to it, and version history comes free with git.

---

## Layout

```
saves/<slot>/project.json     one complete add-on, as the builder models it
saves/<slot>/assets/*.png     the textures that model references
preset/*.json                 the inbox — content waiting to be applied
preset/applied/               presets already merged, kept for history
exports/<tag>/                every artifact from one export, grouped by release tag
CHANGELOG.md                  one entry per Save and per Release
```

Nothing here is implicit. A preset stays in `preset/` until someone applies it
in the builder, and applying it *moves* the file to `preset/applied/` rather
than deleting it — so the history of what came in from where survives.

## Save slots

A slot is a whole version of the add-on you can switch between, not a backup.
`main` is the working one; a slot named `experiment` is a parallel line you can
open, change and abandon without touching `main`.

The builder writes a slot in a single commit — the model, every texture it
references and the changelog entry together — so a save is never half visible.

## Releases

Every export publishes a [GitHub release](../../releases). The channel it went
out on is written into the tag:

| Tag | Channel | What it means |
|---|---|---|
| `v1.2.0-alpha.3` | Alpha | Work in progress. Expect breakage, and expect worlds to need rebuilding. |
| `v1.2.0-beta.1` | Beta | Everything is in and being tested. Safe to play with, not promised stable. |
| `v1.2.0` | Release | Finished and supported. This is the build the repo points people at. |

Alpha and beta are marked pre-releases on GitHub and never become "latest".
Build numbers come from the tags already here rather than from a counter in
anyone's browser, so two people exporting at once cannot both claim `alpha.3`.

Each release carries its files as attachments, and the same files are committed
under `exports/<tag>/` so the repository and the release page agree about what
shipped.

## What comes out of an export

One export can produce up to six files, because the add-on ships to two
different games:

| File | What to do with it |
|---|---|
| `*.mcaddon` | **Bedrock.** Open it; the game imports both packs. Nothing to build. |
| `*-datapack.zip` | **Java, no mod loader.** Drop it in `<world>/datapacks/`. |
| `*-resourcepack.zip` | The other half of the data pack. Drop it in `resourcepacks/`. |
| `*-fabric.zip` | **Fabric mod source.** Not a jar — see below. |
| `*-quilt.zip` | **Quilt mod source.** Also runs on Fabric. |
| `*-forge.zip` / `*-neoforge.zip` | **Forge / NeoForge mod source.** |

The four loader zips are **Gradle source projects, not finished mods**.
Compiling Java needs a JDK, which a browser tab does not have, so the last step
is yours and it is one command:

```bash
unzip plants-and-foods-v1.0.0-fabric.zip -d fabric && cd fabric
gradle wrapper && ./gradlew build     # the jar lands in build/libs/
```

The data pack route needs no build at all — but it also cannot add new blocks
or items, because a Java data pack has no way to register them. Which route
suits this add-on depends on what is in it; the builder's **Compatibility**
panel answers that against the actual project rather than in the abstract.

## The preset inbox

Anything that writes a `.json` file into `preset/` shows up in the builder,
ready to apply to the active save. That is how another tool — Claude Code, a
script, a collaborator opening a pull request — contributes content without
needing to drive the interface.

The format is documented in
[`docs/SCHEMA.md`](https://github.com/manukmiber/Minecraft-web/blob/main/docs/SCHEMA.md)
in the builder repo, and
[`docs/AI_ASSIST.md`](https://github.com/manukmiber/Minecraft-web/blob/main/docs/AI_ASSIST.md)
is the brief to hand an AI tool that is generating one.

## Connecting the builder to this repo

In the builder's **Settings → Project repository**:

1. A fine-grained GitHub token with **contents: write** on this repository.
   Releases count as contents, so that one permission covers saving *and*
   publishing.
2. Owner `manukmiber`, repository `plants-and-foods`, branch `main`.
3. Press **Test connection**.

The token lives in your browser and is sent only to `api.github.com`. Nothing
is stored server-side, and there is no account system to sign up for.
