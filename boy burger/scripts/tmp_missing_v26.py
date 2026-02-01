import re, pathlib, itertools
teoria=pathlib.Path('TEORIA_KOMPLETNA_v2.6.md').read_text(encoding='utf-8', errors='ignore').lower()
missing=pathlib.Path('tmp_missing_candidates.md').read_text(encoding='utf-8', errors='ignore').splitlines()

candidates=[]
cur=None
for line in missing:
    if line.startswith('## '):
        cur=line[3:].strip()
        continue
    if not line.startswith('- '):
        continue
    text=line[2:].strip()
    # skip trivial or already present
    raw=text.lower()
    # check if any 12-char substring exists in teoria for crude match
    found=False
    for i in range(0, max(0, len(raw)-12), 6):
        if raw[i:i+12] in teoria:
            found=True
            break
    if found:
        continue
    candidates.append((cur, text))

out=pathlib.Path('tmp_missing_candidates_v26.md')
with out.open('w', encoding='utf-8') as f:
    f.write('# Missing candidates vs TEORIA_KOMPLETNA_v2.6\n\n')
    for k, group in itertools.groupby(candidates, key=lambda x: x[0]):
        f.write(f"## {k}\n")
        for _, text in group:
            f.write(f"- {text}\n")
        f.write('\n')

print(f"Remaining candidates: {len(candidates)} -> {out}")
