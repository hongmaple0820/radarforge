# -*- coding: utf-8 -*-
"""
内容质量升级方案 md → PDF（复用 q7 方案的 ReportLab 风格体系：Template 07 Crystal Blue）
输入：docs/content-quality-upgrade-plan.md
输出：download/RadarForge内容质量升级方案.pdf
首页：题名区 + 元信息 callout + 目录；次页起正文。
"""
import hashlib
import html as _html
import os
import re
import sys

sys.path.insert(0, "/home/z/my-project/skills/pdf/scripts")

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (HRFlowable, KeepTogether, PageBreak,
                                Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents

FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Noto Sans SC", f"{FONT_DIR}/truetype/chinese/NotoSansSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Noto Sans SC Bold", f"{FONT_DIR}/truetype/chinese/NotoSansSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("SarasaMonoSC", f"{FONT_DIR}/truetype/chinese/SarasaMonoSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")

from pdf import install_font_fallback  # noqa: E402
install_font_fallback()

PAGE_BG      = colors.HexColor("#f5f8fc")
SECTION_BG   = colors.HexColor("#edf2f9")
CARD_BG      = colors.HexColor("#e4ecf5")
TABLE_STRIPE = colors.HexColor("#eef3fa")
HEADER_FILL  = colors.HexColor("#1a4a7a")
BORDER       = colors.HexColor("#c0d0e2")
ACCENT       = colors.HexColor("#2d7ab3")
TEXT_PRIMARY = colors.HexColor("#142840")
TEXT_MUTED   = colors.HexColor("#5a7a96")

PAGE_W, PAGE_H = A4
MARGIN = 54.0
AVAIL_W = PAGE_W - 2 * MARGIN

DOC_TITLE = "RadarForge 内容质量升级方案"
DOC_AUTHOR = "RadarForge 工程组 · 2026-11-05 · 待审核稿"

S = {}
S["body"] = ParagraphStyle("body", fontName="NotoSerifSC", fontSize=10.5, leading=17.5,
                           alignment=TA_LEFT, wordWrap="CJK", firstLineIndent=21,
                           textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=8)
S["bodyni"] = ParagraphStyle("bodyni", parent=S["body"], firstLineIndent=0)
S["h1"] = ParagraphStyle("h1", fontName="NotoSerifSC-Bold", fontSize=16, leading=22,
                         textColor=HEADER_FILL, spaceBefore=16, spaceAfter=4, wordWrap="CJK")
S["h2"] = ParagraphStyle("h2", fontName="NotoSerifSC-Bold", fontSize=12.5, leading=17.5,
                         textColor=TEXT_PRIMARY, spaceBefore=12, spaceAfter=6, wordWrap="CJK")
S["h3"] = ParagraphStyle("h3", fontName="NotoSerifSC-Bold", fontSize=11, leading=15.5,
                         textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=5, wordWrap="CJK")
S["bullet"] = ParagraphStyle("bullet", parent=S["body"], firstLineIndent=0, leftIndent=14,
                             bulletIndent=2, spaceAfter=5)
S["code"] = ParagraphStyle("code", fontName="SarasaMonoSC", fontSize=8, leading=12,
                           textColor=TEXT_PRIMARY, wordWrap="CJK")
S["th"] = ParagraphStyle("th", fontName="NotoSerifSC-Bold", fontSize=8.8, leading=12.5,
                         textColor=colors.white, alignment=TA_CENTER, wordWrap="CJK")
S["td"] = ParagraphStyle("td", fontName="NotoSerifSC", fontSize=8.6, leading=12.2,
                         textColor=TEXT_PRIMARY, alignment=TA_LEFT, wordWrap="CJK")
S["callout_t"] = ParagraphStyle("callout_t", fontName="NotoSerifSC-Bold", fontSize=10, leading=15,
                                textColor=HEADER_FILL, wordWrap="CJK")
S["callout_b"] = ParagraphStyle("callout_b", fontName="NotoSerifSC", fontSize=9.5, leading=15.5,
                                textColor=TEXT_PRIMARY, wordWrap="CJK")
S["toc0"] = ParagraphStyle("toc0", fontName="NotoSerifSC-Bold", fontSize=10.5, leading=16,
                           textColor=TEXT_PRIMARY, wordWrap="CJK", spaceBefore=2)
S["toc_title"] = ParagraphStyle("toc_title", fontName="NotoSerifSC-Bold", fontSize=15, leading=20,
                                textColor=HEADER_FILL, spaceAfter=10)
S["title"] = ParagraphStyle("title", fontName="NotoSerifSC-Bold", fontSize=22, leading=30,
                            textColor=HEADER_FILL, alignment=TA_LEFT, wordWrap="CJK", spaceAfter=6)
S["subtitle"] = ParagraphStyle("subtitle", fontName="NotoSerifSC", fontSize=11.5, leading=17,
                               textColor=TEXT_MUTED, alignment=TA_LEFT, wordWrap="CJK", spaceAfter=4)


class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            self.notify("TOCEntry", (getattr(flowable, "bookmark_level", 0),
                                     getattr(flowable, "bookmark_text", ""),
                                     self.page,
                                     getattr(flowable, "bookmark_key", "")))


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setFont("NotoSerifSC", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 34, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 40, PAGE_W - MARGIN, PAGE_H - 40)
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 38, PAGE_W - MARGIN, 38)
    canvas.setFont("NotoSerifSC", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 26, DOC_AUTHOR)
    if doc.page > 1:
        canvas.setFont("FreeSerif", 8.5)
        canvas.drawRightString(PAGE_W - MARGIN, 26, str(doc.page))
    canvas.restoreState()


def inline(md):
    """markdown 行内 → reportlab 富文本标签"""
    t = _html.escape(md, quote=False)
    t = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)",
               r'<link href="\2" color="#2d7ab3"><u>\1</u></link>', t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`([^`]+)`", r'<font face="SarasaMonoSC" size="9">\1</font>', t)
    return t


def heading(text, level):
    key = "h_" + hashlib.md5(text.encode()).hexdigest()[:8]
    style = S["h1"] if level == 1 else (S["h2"] if level == 2 else S["h3"])
    p = Paragraph('<a name="%s"/>%s' % (key, inline(text)), style)
    if level == 1:
        p.bookmark_name = key
        p.bookmark_level = 0
        p.bookmark_text = re.sub(r"\*\*|`", "", text)
        p.bookmark_key = key
    return p


def callout(title, body):
    data = [[Paragraph(title, S["callout_t"])], [Paragraph(body, S["callout_b"])]]
    t = Table(data, colWidths=[AVAIL_W - 8], hAlign="CENTER")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SECTION_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 3.5, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (0, 0), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
        ("TOPPADDING", (0, 1), (-1, 1), 2),
    ]))
    return t


def code_block(text):
    inner = [[Paragraph(_html.escape(ln).replace(" ", "&nbsp;") or "&nbsp;", S["code"])]
             for ln in text.split("\n")]
    t = Table(inner, colWidths=[AVAIL_W - 10], hAlign="CENTER")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    return t


def make_table(headers, rows):
    n = len(headers)
    # 列宽按内容长度加权（8% 下限，归一化）
    weights = [max(len(h), max((len(r[i]) for r in rows), default=0)) for i, h in enumerate(headers)]
    total = sum(weights)
    ratios = [max(0.08, w / total) for w in weights]
    norm = sum(ratios)
    widths = [r / norm * AVAIL_W for r in ratios]
    data = [[Paragraph("<b>%s</b>" % inline(h), S["th"]) for h in headers]]
    for r in rows:
        data.append([Paragraph(inline(c), S["td"]) for c in r])
    t = Table(data, colWidths=widths, hAlign="CENTER", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), TABLE_STRIPE))
    t.setStyle(TableStyle(style))
    return t


def parse_md(md_path):
    with open(md_path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    story = []
    title_done = False
    meta_buf = []
    in_code = False
    code_buf = []
    table_buf = []
    i = 0
    first_h1 = True

    def flush_meta():
        if meta_buf:
            body = "<br/>".join(inline(x) for x in meta_buf)
            story.append(callout("方案元信息", body))
            story.append(Spacer(1, 10))
            meta_buf.clear()

    def flush_table():
        if table_buf:
            rows = [r for r in table_buf if not re.match(r"^\|[\s:\-|]+\|$", r)]
            parsed = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
            story.append(make_table(parsed[0], parsed[1:]))
            story.append(Spacer(1, 8))
            table_buf.clear()

    while i < len(lines):
        ln = lines[i]
        if ln.strip().startswith("```"):
            flush_table()
            if in_code:
                story.append(code_block("\n".join(code_buf)))
                story.append(Spacer(1, 8))
                code_buf.clear()
                in_code = False
            else:
                in_code = True
            i += 1
            continue
        if in_code:
            code_buf.append(ln)
            i += 1
            continue
        if ln.strip().startswith("|"):
            flush_meta()
            table_buf.append(ln)
            i += 1
            continue
        flush_table()
        s = ln.strip()
        if not s:
            i += 1
            continue
        if s == "---":
            flush_meta()
            i += 1
            continue
        if s.startswith("# ") and not title_done:
            # 文档题名区
            story.append(Spacer(1, 60))
            story.append(Paragraph(inline(s[2:]), S["title"]))
            story.append(HRFlowable(width="100%", thickness=2, color=ACCENT, spaceAfter=10))
            story.append(Paragraph("文章 / 配图 / 视频三线质量升级 · 依据代码取证与外部调研制定", S["subtitle"]))
            story.append(Spacer(1, 12))
            title_done = True
            i += 1
            continue
        if s.startswith("> "):
            meta_buf.append(s[2:])
            i += 1
            continue
        if s.startswith("### "):
            flush_meta()
            story.append(heading(s[4:], 3))
        elif s.startswith("## "):
            flush_meta()
            if first_h1:
                story.append(PageBreak())  # 目录后进正文
                first_h1 = False
            h = heading(s[3:], 1)
            story.append(h)
            story.append(HRFlowable(width="100%", thickness=0.8, color=BORDER, spaceAfter=8))
        elif s.startswith("# "):
            flush_meta()
            story.append(heading(s[2:], 2))
        elif re.match(r"^- ", s):
            flush_meta()
            story.append(Paragraph(inline(s[2:]), S["bullet"], bulletText="•"))
        elif re.match(r"^\d+\. ", s):
            flush_meta()
            num, rest = s.split(". ", 1)
            story.append(Paragraph(inline(rest), S["bullet"], bulletText="%s." % num))
        elif s.startswith("**") and s.rstrip().endswith("**") and s.count("**") == 2:
            # 独立加粗小标题行
            flush_meta()
            story.append(Paragraph("<b>%s</b>" % inline(s.strip("*")), S["bodyni"]))
        elif s.startswith(">"):
            meta_buf.append(s.lstrip("> "))
        else:
            flush_meta()
            story.append(Paragraph(inline(s), S["body"]))
        i += 1
    flush_table()
    flush_meta()
    return story


def main():
    src = "/home/z/my-project/docs/content-quality-upgrade-plan.md"
    dst = "/home/z/my-project/download/RadarForge内容质量升级方案.pdf"
    story = parse_md(src)

    # 题名页后接目录（首章 PageBreak 已由 parse_md 插入）
    toc = TableOfContents()
    toc.levelStyles = [S["toc0"]]
    # 在第一个 PageBreak 前插入目录（插入项自带分页，删除原 PageBreak 避免双分页）
    pb_idx = next(idx for idx, fl in enumerate(story) if isinstance(fl, PageBreak))
    story[pb_idx:pb_idx] = [Paragraph("目 录", S["toc_title"]), toc, PageBreak()]
    story.pop(pb_idx + 3)

    doc = TocDocTemplate(dst, pagesize=A4,
                         leftMargin=MARGIN, rightMargin=MARGIN,
                         topMargin=56, bottomMargin=52,
                         title=DOC_TITLE, author="RadarForge")
    doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
    print("PDF 生成完成：", dst, os.path.getsize(dst), "bytes")


if __name__ == "__main__":
    main()
