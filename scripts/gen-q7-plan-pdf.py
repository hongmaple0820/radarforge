# -*- coding: utf-8 -*-
"""
RadarForge 2.0 七问体检与整固方案 — PDF 正文生成（Report 路由 / ReportLab）
封面单独用 Template 07 Crystal Blue HTML 渲染后 pypdf 合并（见 build-q7-cover 步骤）。
调色板：Template 07 固定蓝色系（cover.md 规定该模板调色板固定，不走 palette.cascade）。
"""
import hashlib
import os
import sys

PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (CondPageBreak, HRFlowable, KeepTogether,
                                PageBreak, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents

# ---------- 字体注册（允许清单内字体） ----------
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Noto Sans SC", f"{FONT_DIR}/truetype/chinese/NotoSansSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Noto Sans SC Bold", f"{FONT_DIR}/truetype/chinese/NotoSansSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("SarasaMonoSC", f"{FONT_DIR}/truetype/chinese/SarasaMonoSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("Noto Sans SC", normal="Noto Sans SC", bold="Noto Sans SC Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold")

from pdf import install_font_fallback  # noqa: E402  混排字体兜底（必调）
install_font_fallback()

# ---------- Template 07 Crystal Blue 正文调色板（固定） ----------
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
AVAIL_H = PAGE_H - 2 * MARGIN
H1_THRESHOLD = AVAIL_H * 0.25

DOC_TITLE = "RadarForge 2.0 七问体检与整固方案"
DOC_AUTHOR = "RadarForge 工程组"

# ---------- 样式 ----------
S = {}
S["body"] = ParagraphStyle("body", fontName="NotoSerifSC", fontSize=10.5, leading=17.5,
                           alignment=TA_LEFT, wordWrap="CJK", firstLineIndent=21,
                           textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=8)
S["bodyni"] = ParagraphStyle("bodyni", parent=S["body"], firstLineIndent=0)
S["h1"] = ParagraphStyle("h1", fontName="NotoSerifSC-Bold", fontSize=17, leading=23,
                         textColor=HEADER_FILL, spaceBefore=16, spaceAfter=4, wordWrap="CJK")
S["h2"] = ParagraphStyle("h2", fontName="NotoSerifSC-Bold", fontSize=13, leading=18,
                         textColor=TEXT_PRIMARY, spaceBefore=13, spaceAfter=6, wordWrap="CJK")
S["h3"] = ParagraphStyle("h3", fontName="NotoSerifSC-Bold", fontSize=11.5, leading=16,
                         textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=5, wordWrap="CJK")
S["bullet"] = ParagraphStyle("bullet", parent=S["body"], firstLineIndent=0, leftIndent=14,
                             bulletIndent=2, spaceAfter=5)
S["code"] = ParagraphStyle("code", fontName="SarasaMonoSC", fontSize=8, leading=12,
                           textColor=TEXT_PRIMARY, wordWrap="CJK")
S["cap"] = ParagraphStyle("cap", fontName="NotoSerifSC", fontSize=8.5, leading=12,
                          textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=6)
S["th"] = ParagraphStyle("th", fontName="NotoSerifSC-Bold", fontSize=8.8, leading=12.5,
                         textColor=colors.white, alignment=TA_CENTER, wordWrap="CJK")
S["td"] = ParagraphStyle("td", fontName="NotoSerifSC", fontSize=8.6, leading=12.2,
                         textColor=TEXT_PRIMARY, alignment=TA_LEFT, wordWrap="CJK")
S["tdc"] = ParagraphStyle("tdc", parent=S["td"], alignment=TA_CENTER)
S["callout_t"] = ParagraphStyle("callout_t", fontName="NotoSerifSC-Bold", fontSize=10, leading=15,
                                textColor=HEADER_FILL, wordWrap="CJK")
S["callout_b"] = ParagraphStyle("callout_b", fontName="NotoSerifSC", fontSize=9.5, leading=15.5,
                                textColor=TEXT_PRIMARY, wordWrap="CJK")
S["toc0"] = ParagraphStyle("toc0", fontName="NotoSerifSC-Bold", fontSize=10.5, leading=16,
                           textColor=TEXT_PRIMARY, wordWrap="CJK", spaceBefore=2)
S["toc1"] = ParagraphStyle("toc1", fontName="NotoSerifSC", fontSize=9, leading=13,
                           leftIndent=18, textColor=TEXT_MUTED, wordWrap="CJK")
S["toc_title"] = ParagraphStyle("toc_title", fontName="NotoSerifSC-Bold", fontSize=15, leading=20,
                                textColor=HEADER_FILL, spaceAfter=10)


class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            self.notify("TOCEntry", (level, text, self.page, key))


def on_page(canvas, doc):
    """页面底色 + 页眉页脚。第一页（目录页）不显示页码。"""
    canvas.saveState()
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    # 页眉：文档题名 + 强调色细线
    canvas.setFont("NotoSerifSC", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 34, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 40, PAGE_W - MARGIN, PAGE_H - 40)
    # 页脚：作者 + 页码（目录页隐藏）
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


def heading(text, level):
    key = "h_" + hashlib.md5(text.encode()).hexdigest()[:8]
    style = S["h1"] if level == 0 else (S["h2"] if level == 1 else S["h3"])
    p = Paragraph('<a name="%s"/>%s' % (key, text), style)
    if level == 0:  # 目录只收章级（15 页文档的合理粒度）
        p.bookmark_name = key
        p.bookmark_level = 0
        p.bookmark_text = text
        p.bookmark_key = key
    return p


def code_block(text):
    import html as _html
    inner = [[Paragraph(_html.escape(line).replace(" ", "&nbsp;"), S["code"])] for line in text.split("\n")]
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


def make_table(headers, rows, ratios, font=None, center_cols=()):
    assert abs(sum(ratios) - 1.0) < 0.01, "ratios must sum to 1"
    widths = [r * AVAIL_W for r in ratios]
    assert sum(widths) <= AVAIL_W + 0.5
    data = [[Paragraph("<b>%s</b>" % h, S["th"]) for h in headers]]
    for row in rows:
        cells = []
        for i, c in enumerate(row):
            st = S["tdc"] if i in center_cols else S["td"]
            cells.append(Paragraph(str(c), st))
        data.append(cells)
    t = Table(data, colWidths=widths, hAlign="CENTER", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
    ]
    for i in range(1, len(data)):
        style.append(("BACKGROUND", (0, i), (-1, i), colors.white if i % 2 == 1 else TABLE_STRIPE))
    t.setStyle(TableStyle(style))
    return t


# ============================================================
# 内容装配
# ============================================================
story = []

# ---- 目录页 ----
story.append(Paragraph("目 录", S["toc_title"]))
toc = TableOfContents()
toc.levelStyles = [S["toc0"], S["toc1"]]
story.append(toc)
story.append(PageBreak())

from q7_plan_content import BLOCKS  # noqa: E402  内容模块

i = 0
while i < len(BLOCKS):
    kind = BLOCKS[i][0]
    if kind == "h1":
        story.append(CondPageBreak(H1_THRESHOLD))
        h = heading(BLOCKS[i][1], 0)
        rule = HRFlowable(width="100%", color=ACCENT, thickness=1.1,
                          spaceBefore=1, spaceAfter=9)
        nxt = BLOCKS[i + 1] if i + 1 < len(BLOCKS) else None
        if nxt and nxt[0] in ("p", "table", "callout", "code"):
            story.append(KeepTogether([h, rule]))
        else:
            story.append(KeepTogether([h, rule]))
        story.append(Spacer(1, 0))
    elif kind == "h2":
        story.append(CondPageBreak(70))
        story.append(heading(BLOCKS[i][1], 1))
    elif kind == "h3":
        story.append(CondPageBreak(55))
        story.append(heading(BLOCKS[i][1], 2))
    elif kind == "p":
        story.append(Paragraph(BLOCKS[i][1], S["body"]))
    elif kind == "pn":
        story.append(Paragraph(BLOCKS[i][1], S["bodyni"]))
    elif kind == "bullet":
        for item in BLOCKS[i][1]:
            story.append(Paragraph(item, S["bullet"], bulletText="•"))
        story.append(Spacer(1, 4))
    elif kind == "code":
        story.append(Spacer(1, 4))
        story.append(code_block(BLOCKS[i][1]))
        story.append(Spacer(1, 6))
    elif kind == "callout":
        story.append(Spacer(1, 5))
        story.append(KeepTogether(callout(BLOCKS[i][1], BLOCKS[i][2])))
        story.append(Spacer(1, 8))
    elif kind == "table":
        headers, rows, ratios = BLOCKS[i][1], BLOCKS[i][2], BLOCKS[i][3]
        center = BLOCKS[i][4] if len(BLOCKS[i]) > 4 else ()
        story.append(Spacer(1, 6))
        story.append(make_table(headers, rows, ratios, center_cols=center))
        if i + 1 < len(BLOCKS) and BLOCKS[i + 1][0] == "caption":
            story.append(Paragraph(BLOCKS[i + 1][1], S["cap"]))
            i += 1
        story.append(Spacer(1, 8))
    elif kind == "caption":
        story.append(Paragraph(BLOCKS[i][1], S["cap"]))
    elif kind == "spacer":
        story.append(Spacer(1, BLOCKS[i][1]))
    i += 1

# ---------- 构建 ----------
OUT = "/home/z/my-project/download/_q7_body.pdf"
doc = TocDocTemplate(OUT, pagesize=A4,
                     leftMargin=MARGIN, rightMargin=MARGIN,
                     topMargin=64, bottomMargin=58,
                     title=DOC_TITLE, author="Z.ai", creator="Z.ai",
                     subject="RadarForge 2.0 七问代码级体检与整固实施路线")
doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
print("BODY OK ->", OUT)
