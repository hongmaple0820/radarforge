# -*- coding: utf-8 -*-
"""合并封面与正文为最终 PDF（cover 归一化 A4 后插入为第 0 页）。"""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89
COVER = "/home/z/my-project/download/_q7_cover.pdf"
BODY = "/home/z/my-project/download/_q7_body.pdf"
OUT = "/home/z/my-project/download/RadarForge七问体检与整固方案.pdf"


def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page


writer = PdfWriter()
writer.add_page(normalize(PdfReader(COVER).pages[0]))
for p in PdfReader(BODY).pages:
    writer.add_page(normalize(p))
writer.add_metadata({
    "/Title": "RadarForge 2.0 七问体检与整固方案",
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": "七问代码级体检、根因分析与三批十二项整固路线",
})
with open(OUT, "wb") as f:
    writer.write(f)
print("MERGED ->", OUT, "pages:", len(PdfReader(OUT).pages))
