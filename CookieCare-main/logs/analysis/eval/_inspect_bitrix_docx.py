import zipfile
import re
import os

path = r"C:\Users\abhinav.yadav_randst\Downloads\DPA - 1.docx"
out = r"c:\Program Files\CookieCare\CookieCare-main\logs\analysis\eval\_bitrix_docx_inspect.txt"

z = zipfile.ZipFile(path)
xml = z.read("word/document.xml").decode("utf-8")
tbls = len(re.findall(r"<w:tbl[\s>]", xml))
rows = len(re.findall(r"<w:tr[\s>]", xml))
cells = len(re.findall(r"<w:tc[\s>]", xml))

cell_texts = []
for m in re.finditer(r"<w:tc[\s>][\s\S]*?</w:tc>", xml):
    texts = re.findall(r"<w:t[^>]*>([^<]*)</w:t>", m.group(0))
    t = " ".join(texts).strip()
    if t:
        cell_texts.append(t)
    if len(cell_texts) >= 50:
        break

lines = [
    f"file={path}",
    f"size={os.path.getsize(path)}",
    f"w:tbl count={tbls}",
    f"w:tr count={rows}",
    f"w:tc count={cells}",
    f"Appendix mentions={len(re.findall(r'Appendix', xml, re.I))}",
    "--- first cell texts ---",
]
lines.extend(f"  [{i}] {t[:140]}" for i, t in enumerate(cell_texts, 1))

plain = re.sub(r"<[^>]+>", " ", xml)
plain = re.sub(r"\s+", " ", plain)
for needle in [
    "PROCESSING SUBJECT",
    "Personal details",
    "Staff including",
    "Collecting, recording",
    "Term means",
    "Appendix 1",
]:
    lines.append(f"plain has {needle!r}: {needle.lower() in plain.lower()}")

# Also run mammoth path if possible
try:
    import mammoth
    from pathlib import Path
    import importlib.util
    # use project extractText via subprocess node instead
except Exception as e:
    lines.append(f"mammoth skip: {e}")

open(out, "w", encoding="utf-8").write("\n".join(lines))
print("wrote", out)
