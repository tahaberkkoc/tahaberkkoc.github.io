# Personal Website

Source of my personal website: **[tahaberkkoc.github.io](https://tahaberkkoc.github.io)**

All page content is written in LaTeX (`content/`) and turned into a static site by a small Node.js generator (`scripts/`). The design lives in `src/`.

```bash
python3 run.py      # local preview at http://localhost:5173
npm run build       # static site in dist/
```

Every push to `main` is deployed to GitHub Pages automatically.
