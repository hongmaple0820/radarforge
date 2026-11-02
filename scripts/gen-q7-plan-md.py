# -*- coding: utf-8 -*-
"""从同一内容块生成 docs/ Markdown 镜像，保证 PDF 与仓库文档一致性。"""
import importlib.util
import os

spec = importlib.util.spec_from_file_location("m", "/home/z/my-project/scripts/q7_plan_content.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

lines = [
    "# RadarForge 2.0 七问体检与整固方案",
    "",
    "> 深度版 · 2026-11-02 · 基于主干 cbcb0c3 只读取证 · 零 LLM 配额消耗",
    "> PDF 版：download/RadarForge七问体检与整固方案.pdf（19 页）",
    "",
]

first_h1 = True
for b in m.BLOCKS:
    kind = b[0]
    if kind == "h1":
        lines += ["", "## " + b[1], ""]
    elif kind == "h2":
        lines += ["", "### " + b[1], ""]
    elif kind == "h3":
        lines += ["", "#### " + b[1], ""]
    elif kind in ("p", "pn"):
        lines += [b[1], ""]
    elif kind == "bullet":
        for item in b[1]:
            lines += ["- " + item]
        lines += [""]
    elif kind == "code":
        lines += ["```", b[1], "```", ""]
    elif kind == "callout":
        lines += ["> **" + b[1] + "**", ">", "> " + b[2], ""]
    elif kind == "table":
        headers, rows = b[1], b[2]
        lines += ["| " + " | ".join(headers) + " |"]
        lines += ["| " + " | ".join(["---"] * len(headers)) + " |"]
        for row in rows:
            lines += ["| " + " | ".join(str(c).replace("\n", " ") for c in row) + " |"]
        lines += [""]
    elif kind == "caption":
        lines += ["*" + b[1] + "*", ""]

out = "/home/z/my-project/docs/q7-consolidation-plan.md"
with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(lines).strip() + "\n")
print("MD OK ->", out, os.path.getsize(out), "bytes")
