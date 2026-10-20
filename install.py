#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
"""Install the SA Rates & Build-ups module into an OpenConstructionERP checkout.

    python install.py /path/to/OpenConstructionERP            # install / upgrade
    python install.py /path/to/OpenConstructionERP --check    # report only, change nothing

What it does, and nothing else:
  1. copies module/sa-rates/ to frontend/src/modules/sa-rates/
  2. adds one import and one entry to frontend/src/modules/_registry.ts
  3. adds "nav.sa-rates" and "modules.sa_rates.name" to each locale file
     that carries "nav.benchmarks" (the regional overlays en-GB / en-US do not)

It edits by anchor, not by diff, so it survives unrelated upstream changes.
Every step is idempotent: running it twice changes nothing the second time.
If an anchor is missing it stops before writing anything.
"""
import argparse, json, re, shutil, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODULE_SRC = HERE / "module" / "sa-rates"
NAMES = json.loads((HERE / "locale_names.json").read_text(encoding="utf-8"))

REG_IMPORT = "import { manifest as saRates } from './sa-rates/manifest';\n"
REG_IMPORT_ANCHOR = re.compile(r"(import \{ manifest as \w+ \} from '\./[\w-]+/manifest';\n)(?![\s\S]*import \{ manifest as)")
REG_ARRAY_ANCHOR = re.compile(r"(export const MODULE_REGISTRY: ModuleManifest\[\] = \[\n(?:  .*\n)*?)(\];)")
LOCALE_ANCHOR = re.compile(r'\n(\s*)"nav\.benchmarks": "[^"\n]*",\n')


def plan(root: Path):
    fe = root / "frontend" / "src"
    reg = fe / "modules" / "_registry.ts"
    if not reg.exists():
        sys.exit(f"Not an OpenConstructionERP checkout: {reg} missing")
    writes = {}

    s = reg.read_text(encoding="utf-8")
    if "./sa-rates/manifest" not in s:
        m = REG_IMPORT_ANCHOR.search(s)
        a = REG_ARRAY_ANCHOR.search(s)
        if not m or not a:
            sys.exit("_registry.ts: could not find the import block or MODULE_REGISTRY array")
        s = s[: m.end()] + REG_IMPORT + s[m.end():]
        a = REG_ARRAY_ANCHOR.search(s)
        s = s[: a.start(2)] + "  saRates,\n" + s[a.start(2):]
        writes[reg] = s

    for f in sorted((fe / "app" / "locales").glob("*.ts")):
        lng = f.stem
        if lng not in NAMES:
            continue
        with open(f, encoding="utf-8", newline="") as fh:
            t = fh.read()
        if '"nav.sa-rates"' in t:
            continue
        m = LOCALE_ANCHOR.search(t)
        if not m:
            continue  # locale without a nav.benchmarks key: falls back to English
        ind, name = m.group(1), json.dumps(NAMES[lng], ensure_ascii=False)
        t = t[: m.end()] + f'{ind}"nav.sa-rates": {name},\n{ind}"modules.sa_rates.name": {name},\n' + t[m.end():]
        writes[f] = t
    return fe / "modules" / "sa-rates", writes


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("checkout", type=Path)
    ap.add_argument("--check", action="store_true", help="report what would change, write nothing")
    a = ap.parse_args()
    root = a.checkout.resolve()
    dest, writes = plan(root)
    print(f"module: {'upgrade' if dest.exists() else 'new'} -> {dest.relative_to(root)}")
    for p in writes:
        print(f"edit:   {p.relative_to(root)}")
    if a.check:
        print("check only, nothing written")
        return
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(MODULE_SRC, dest)
    for p, text in writes.items():
        with open(p, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
    print("done. Next: cd frontend && npx vitest run src/modules/sa-rates && npm run build")


if __name__ == "__main__":
    main()
