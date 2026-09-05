# The preset inbox

Drop a `.json` file in here and it appears in the builder's **Preset inbox**
panel, ready to apply to the active save.

This is the seam that lets something other than the interface add content —
Claude Code, a script, or a collaborator opening a pull request. Nothing is
applied automatically: a preset waits here until someone chooses it, and
applying it moves the file into `applied/` rather than deleting it, so the
record of what arrived from where survives in git.

## The format, in one example

```json
{
  "presetFormat": 1,
  "id": "wild-herbs",
  "label": "Wild herbs",
  "description": "Three herbs that scatter through plains and forest.",
  "nodes": [
    {
      "kind": "crop",
      "name": "sage",
      "displayName": "Sage",
      "data": {
        "stages": 4,
        "produce": "#item:sage_leaf",
        "generateSeed": true
      }
    },
    {
      "kind": "item",
      "name": "sage_leaf",
      "displayName": "Sage Leaf",
      "data": { "isFood": true, "nutrition": 1, "saturation": 0.2 }
    }
  ]
}
```

The `#kind:name` form is how one node in a preset refers to another before
either exists — the builder resolves those into real node ids as it applies the
file, so a preset never has to invent ids or guess at the ones already in use.

The full schema, every field each content kind accepts, and the rules for
textures are in
[`docs/SCHEMA.md`](https://github.com/manukmiber/Minecraft-web/blob/main/docs/SCHEMA.md).
If you are pointing an AI tool at this, hand it
[`docs/AI_ASSIST.md`](https://github.com/manukmiber/Minecraft-web/blob/main/docs/AI_ASSIST.md)
instead — it is written as a brief rather than a reference.

## Two things worth knowing

**Textures are usually not in the preset.** A preset carries field values, not
PNGs. A crop that arrives here with no artwork is applied fine and then shows
the missing-texture checker until someone draws or drops one in the builder.
That is deliberate: base64 images inside a JSON file make the diff unreadable
and the file enormous.

The exception is artwork the builder already ships. An `assets` array binds one
of its own images to a texture slot on a node the preset creates:

```json
"assets": [
  {
    "node": "entity:kohane",
    "slot": "main",
    "fileName": "kohane.png",
    "url": "textures/companion/kohane/kohane.png",
    "width": 512,
    "height": 512
  }
]
```

`url` has to be a path under `textures/` served by the builder — a preset in
this inbox is untrusted input, and one that could name any host would be
fetching bytes off the internet the moment somebody pressed **Apply**. Something
genuinely self-contained can inline `base64` instead, with the size caveat
above. A texture that fails to load leaves its slot empty; the rest of the
preset still applies.

**A preset can be wrong and still apply.** The builder validates on apply and
reports what it could not use rather than refusing the whole file, so a preset
with one unknown field still contributes everything else.
