#!/usr/bin/env python3
# ============================================================
# convert-wewrite-themes.py —— wewrite 18 主题 YAML → TS 注册表
# 移植 wewrite（MIT）主题体系：colors 调色板 + base_css 解析为
# 简单选择器规则（拒 : @ > + ~ [ *，学 theme._is_simple_selector）
# + var(--x) 色彩变量解析 + darkmode 双位置兼容
# 产物：src/lib/publish/themes.ts
# ============================================================
import yaml
import re
import os

THEME_DIR = "/home/z/my-project/repos/wewrite/src/wewrite/toolkit/themes"
OUT = "/home/z/my-project/src/lib/publish/themes.ts"

CATEGORIES = {
    "professional-clean": ("通用", "干净专业"),
    "minimal": ("通用", "极简"),
    "newspaper": ("通用", "报刊"),
    "tech-modern": ("科技", "现代科技"),
    "bytedance": ("科技", "字节风"),
    "github": ("科技", "GitHub"),
    "warm-editorial": ("文艺", "暖调编辑"),
    "sspai": ("文艺", "少数派"),
    "ink": ("文艺", "水墨"),
    "elegant-rose": ("文艺", "优雅玫瑰"),
    "bold-navy": ("商务", "藏青"),
    "minimal-gold": ("商务", "素金"),
    "bold-green": ("商务", "商务绿"),
    "bauhaus": ("风格", "包豪斯"),
    "focus-red": ("风格", "聚焦红"),
    "midnight": ("风格", "午夜"),
    "impeccable": ("专属", "Impeccable"),
    "lobster-notes": ("专属", "龙虾笔记"),
}

REJECT_CHARS = ":@>+~[*"


def is_simple_selector(sel: str) -> bool:
    sel = sel.strip()
    return not any(ch in sel for ch in REJECT_CHARS)


def parse_rules(css: str):
    """CSS 文本 → {selector: {prop: value}}（同选择器后者覆盖，学 get_inline_css_rules）"""
    rules = {}
    # 去注释
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    # 逐块匹配 selector { body }
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", css):
        sel_group = m.group(1).strip()
        body = m.group(2)
        props = {}
        for decl in body.split(";"):
            if ":" not in decl:
                continue
            k, v = decl.split(":", 1)
            k = k.strip().lower()
            v = v.strip()
            if k and v:
                props[k] = v
        if not props:
            continue
        for sel in sel_group.split(","):
            sel = sel.strip()
            if not sel or not is_simple_selector(sel) or sel == "body":
                continue
            if sel in rules:
                rules[sel].update(props)
            else:
                rules[sel] = dict(props)
    return rules


def resolve_vars(value: str, colors: dict) -> str:
    """var(--primary) → colors.primary（键名去 -- 连字符转下划线，学 _resolve_css_variables）"""

    def repl(m):
        key = m.group(1).lstrip("-").replace("-", "_")
        return colors.get(key, m.group(0))

    return re.sub(r"var\((--[a-zA-Z0-9_-]+)\)", repl, value)


def main():
    themes = []
    for fn in sorted(os.listdir(THEME_DIR)):
        if not fn.endswith(".yaml"):
            continue
        with open(os.path.join(THEME_DIR, fn), encoding="utf-8") as f:
            data = yaml.safe_load(f)
        name = data["name"]
        desc = data.get("description", "")
        colors = dict(data.get("colors") or {})
        # darkmode 双位置兼容：colors.darkmode 优先，顶层 darkmode 兜底（wewrite 实测 13/18 写在顶层被静默忽略）
        darkmode = (colors.get("darkmode") or {}) or (data.get("darkmode") or {})
        if isinstance(darkmode, dict):
            colors.pop("darkmode", None)
        else:
            darkmode = {}
        raw_css = data.get("base_css", "")
        rules = parse_rules(raw_css)
        # var() 解析（对全部规则值做一次）
        resolved = {}
        for sel, props in rules.items():
            resolved[sel] = {k: resolve_vars(v, colors) for k, v in props.items()}
        cat, cat_label = CATEGORIES.get(name, ("通用", name))
        themes.append(
            {
                "name": name,
                "description": desc,
                "category": cat,
                "categoryLabel": cat_label,
                "colors": colors,
                "darkmode": darkmode,
                "rules": resolved,
                "sectionNumbering": bool(data.get("section_numbering", False)),
                "aigcFooter": bool(data.get("aigc_footer", True)),
            }
        )

    # ---------- 生成 TS ----------
    def ts_str(s):
        return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'

    def ts_obj(d, indent=2):
        if not d:
            return "{}"
        pad = " " * indent
        inner = ",\n".join(f"{pad}  {ts_str(k)}: {ts_str(v)}" for k, v in d.items())
        return "{\n" + inner + ",\n" + pad + "}"

    def ts_rules(rules, indent=2):
        if not rules:
            return "{}"
        pad = " " * indent
        parts = []
        for sel, props in rules.items():
            parts.append(f"{pad}  {ts_str(sel)}: {ts_obj(props, indent + 4)}")
        return "{\n" + ",\n".join(parts) + ",\n" + pad + "}"

    lines = []
    lines.append("// ============================================================")
    lines.append("// themes.ts —— 微信排版主题注册表（18 主题移植自 wewrite，MIT）")
    lines.append("// 由 scripts/convert-wewrite-themes.py 生成；调主题请改 wewrite YAML")
    lines.append("// 再重跑转换脚本。规则 = base_css 解析后的简单选择器内联规则")
    lines.append("// （拒 : @ > + ~ [ *，与 wewrite get_inline_css_rules 同语义）")
    lines.append("// ============================================================")
    lines.append("")
    lines.append("export interface WechatTheme {")
    lines.append("  name: string")
    lines.append("  description: string")
    lines.append("  category: string")
    lines.append("  categoryLabel: string")
    lines.append("  colors: Record<string, string>")
    lines.append("  darkmode: Record<string, string>")
    lines.append("  /** 简单选择器 → 内联样式规则（值已完成 var(--x) 解析） */")
    lines.append("  rules: Record<string, Record<string, string>>")
    lines.append("  sectionNumbering: boolean")
    lines.append("  aigcFooter: boolean")
    lines.append("}")
    lines.append("")
    lines.append("export const WECHAT_THEMES: WechatTheme[] = [")
    for t in themes:
        lines.append("  {")
        lines.append(f"    name: {ts_str(t['name'])},")
        lines.append(f"    description: {ts_str(t['description'])},")
        lines.append(f"    category: {ts_str(t['category'])},")
        lines.append(f"    categoryLabel: {ts_str(t['categoryLabel'])},")
        lines.append(f"    colors: {ts_obj(t['colors'], 4)},")
        lines.append(f"    darkmode: {ts_obj(t['darkmode'], 4)},")
        lines.append(f"    rules: {ts_rules(t['rules'], 4)},")
        lines.append(f"    sectionNumbering: {'true' if t['sectionNumbering'] else 'false'},")
        lines.append(f"    aigcFooter: {'true' if t['aigcFooter'] else 'false'},")
        lines.append("  },")
    lines.append("]")
    lines.append("")
    lines.append("const BY_NAME = new Map(WECHAT_THEMES.map((t) => [t.name, t]))")
    lines.append("")
    lines.append("/** 旧版三主题 → wewrite 主题的兼容映射（历史 run 不失渲染能力） */")
    lines.append('export const LEGACY_THEME_ALIAS: Record<string, string> = {')
    lines.append('  radar: "professional-clean",')
    lines.append('  ink: "ink",')
    lines.append('  cream: "warm-editorial",')
    lines.append("}")
    lines.append("")
    lines.append("export function getWechatTheme(name: string): WechatTheme {")
    lines.append("  return BY_NAME.get(name) ?? BY_NAME.get(LEGACY_THEME_ALIAS[name] ?? '') ?? BY_NAME.get('professional-clean')!")
    lines.append("}")
    lines.append("")
    lines.append("export function wechatThemeList(): { id: string; label: string; category: string; description: string }[] {")
    lines.append("  return WECHAT_THEMES.map((t) => ({ id: t.name, label: `${t.categoryLabel} · ${t.name}`, category: t.category, description: t.description }))")
    lines.append("}")
    lines.append("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"converted {len(themes)} themes -> {OUT}")
    total_rules = sum(len(t["rules"]) for t in themes)
    print(f"total css rules: {total_rules}")


if __name__ == "__main__":
    main()
