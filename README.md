# Flare

A browser 3D modeler with a Blender-like viewport: add primitives, edit vertices / edges / faces, extrude, and inset.

## Run

### Option A — Live Server / any static server (no npm)

Open the **`flare` folder** (the one that contains `index.html`) with VS Code Live Server, or any static server.

You need an internet connection the first time so the browser can load Three.js from the CDN (see the import map in `index.html`).

Folder names must match the imports:

```
flare/
  index.html
  public/favicon.svg
  src/
    main.js
    App.js
    Viewport.js
    ui.js
    export.js
    style.css
    mesh/          ← must be "mesh", not "meshes"
      BMesh.js
      primitives.js
      ops.js
```

If you named the folder `src/meshes`, rename it to `src/mesh`.

### Option B — Vite

```bash
npm install
npm run dev
```

## Modeling

| Action | Shortcut |
| --- | --- |
| Object / Edit mode | `Tab` |
| Vertex / Edge / Face | `1` `2` `3` (Edit mode) |
| Add primitive | `Shift+A` |
| Move / Rotate / Scale | `G` `R` `S` |
| Extrude | `E` |
| Inset faces | `I` |
| Axis constraint | `X` `Y` `Z` while transforming |
| Numeric input | type a number during a transform |
| Box select | drag, or `B` |
| 3D cursor | `Shift` + right click |
| Orbit / Pan / Zoom | Middle mouse · `Shift` + MMB · wheel |

New meshes spawn at the 3D cursor. After adding a primitive, the *Adjust Last Operation* panel (bottom-left) lets you change segments, radius, fill type, and so on.

Export the scene from **File → Export OBJ** or **Export glTF**.

## Credits

Built by the project author with hands-on help from an AI coding agent on
[Arena.ai](https://arena.ai). The agent contributed the overall architecture,
the mesh engine (`src/mesh/`), the Three.js viewport, the editing tools
(extrude, inset, subdivide, merge, normals), the UI chrome, and the export
pipelines — iterating together with the author to design the Blender-style
workflow and fix issues in real time.

If you run into a bug or have an idea, please open an issue — it's a genuinely
collaborative effort, and feedback shapes what gets built next.

## Contributing

Bugs, feature ideas, and pull requests are welcome — see `CONTRIBUTING.md`.

## License

**MIT** — see `LICENSE`.

> Note: Flare is an independent, original reimplementation of a Blender-style
> modeling workflow. It does **not** include or derive from Blender's source
> code, so it is not bound by Blender's GPL. The name and logo are Flare's own;
> it is not affiliated with or endorsed by the Blender Foundation.

**Third-party:** [Three.js](https://threejs.org/) is used for rendering and is
MIT-licensed (© 2010-2026 Three.js Authors). See its license for full terms.

