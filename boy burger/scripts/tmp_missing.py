import re, pathlib, itertools
teoria=pathlib.Path('TEORIA_KOMPLETNA_v2.5.md').read_text(encoding='utf-8', errors='ignore').lower()
summ=pathlib.Path('tmp_extracted_summary.md').read_text(encoding='utf-8', errors='ignore').splitlines()

out=[]
cur=None
for line in summ:
    if line.startswith('## '):
        cur=line[3:].strip()
        continue
    if not line.startswith('- '):
        continue
    text=line[2:].strip()
    raw=text.lower()
    tokens=re.findall(r"[a-zA-ZąćęłńóśżźĄĆĘŁŃÓŚŻŹ0-9]+", raw)
    keywords=[t for t in tokens if (len(t)>=7 or re.search(r"\d", t))]
    if len(keywords)<2:
        continue
    hits=sum(1 for k in set(keywords[:6]) if k in teoria)
    if hits<2:
        out.append((cur, text))

out_path=pathlib.Path('tmp_missing_candidates.md')
with out_path.open('w', encoding='utf-8') as f:
    f.write('# Possible missing candidates vs TEORIA_KOMPLETNA_v2.5\n\n')
    for k, group in itertools.groupby(out, key=lambda x: x[0]):
        f.write(f"## {k}\n")
        for _, text in group:
            f.write(f"- {text}\n")
        f.write('\n')

print(f"Missing candidates: {len(out)} -> {out_path}")
