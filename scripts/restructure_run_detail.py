#!/usr/bin/env python3
# ============================================================
# restructure_run_detail.py —— run-detail.tsx 信息重排的行级手术
# 目标结构（P1 抓手 3「Run 详情信息重排」）：
#   稿优先——单列主体（动作栏/改稿/成稿(版本树+指着改)/改写/
#   视频分镜/视频成片/发布中心/封面），证据链（brief/大纲/断言/
#   claims/审稿/飞轮）折叠进文末「为什么这样写」抽屉。
# 幂等：重复运行会因找不到标记而报错退出（不破坏已改文件）。
# ============================================================
import sys

PATH = "src/components/run-detail.tsx"
lines = open(PATH, encoding="utf-8").read().split("\n")

def find_one(marker: str, start: int = 0) -> int:
    hits = [i for i, l in enumerate(lines) if marker in l]
    if len(hits) != 1:
        print(f"❌ 标记数量异常: {marker!r} -> {len(hits)} 处")
        sys.exit(1)
    return hits[0]

# --- 边界定位（0 起始索引） ---
i_grid = find_one('<div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-4">')
i_left_c = find_one("{/* 左列：brief + claims + 审稿 + 封面 + 飞轮 */}")
i_left_open = i_left_c + 1                      # <div className="space-y-4">
i_brief = find_one("{/* brief */}")
i_cover = find_one("{/* 封面（手动可重试")       # 封面卡起点
i_flywheel = find_one("{/* 飞轮规则 */}")
i_left_close = i_flywheel - 1                   # </div>（关左列 space-y-4）——飞轮卡结束的后一行
i_right_c = find_one("{/* 右列：成稿 + 预览 + 动作 */}")
i_right_open = i_right_c + 1                    # <div className="space-y-4">
# 右列结束 = 文件倒数第 6 行附近：最后的 </div>\n      </div>\n    </div>\n  )\n}
i_end_cards = None  # 不需要：右列关闭由尾部结构定位（见下）
# 实际右列关闭结构（尾部五行）：
#   ...</Card>
#   )}          <- 发布中心 latest && (...) 的闭合
#   </div>      <- 关右列 space-y-4
#   </div>      <- 关 grid
#   </div>      <- 关最外层 space-y-4
#   )
#   }
tail = "\n".join(lines[-6:])
if not tail.rstrip().endswith("</div>\n    </div>\n  )\n}"):
    print("❌ 文件尾部结构与预期不符："); print(tail); sys.exit(1)
# 定位：倒数第 3 行是 "  )"（return 的闭合），倒数第 4 行是 "    </div>"（最外层），
# 倒数第 5 行是 "      </div>"（grid 关闭），倒数第 6 行是 "        </div>"（右列关闭）
i_right_close = len(lines) - 6                  # 右列 </div>
i_grid_close = len(lines) - 5                   # grid </div>
i_outer_close = len(lines) - 4                  # 最外层 </div>

# --- 抽块 ---
left_cards = lines[i_brief:i_left_close]        # brief..飞轮（不含左列开/闭）
cover_card = lines[i_cover:i_flywheel]          # 封面卡（含前导注释行）
evidence_cards = lines[i_brief:i_cover] + lines[i_flywheel:i_left_close]  # 去掉封面的证据链
right_cards = lines[i_right_open + 1:i_right_close]  # 右列卡（不含开/闭 div）

def indent(block, pad):
    return [pad + l if l.strip() else l for l in block]

# --- 组装新文件 ---
new_lines = []
new_lines += lines[:i_grid]
new_lines += [
    "      {/* 稿件主体（P1 信息重排：稿优先——正文与导出占首屏） */}",
    "      <div className=\"space-y-4\">",
]
new_lines += indent(right_cards, "")            # 右列卡原缩进保持（已在 8 空格层级）
# 封面卡并入主体（发布资产，与发布中心同区），缩进 -2
new_lines += indent(cover_card, "")
new_lines += [
    "      </div>",
    "",
    "      {/* 为什么这样写（P1 信息重排：证据链折叠抽屉，与可溯源卖点对齐） */}",
    "      <Collapsible open={whyOpenValue} onOpenChange={(v) => setWhyOpen(v)}>",
    "        <CollapsibleTrigger asChild>",
    "          <button className=\"w-full rounded-xl border px-4 py-3 flex items-center gap-2 hover:bg-muted/40 transition-colors text-left\">",
    "            <HelpCircle className=\"h-4 w-4 text-amber-500 shrink-0\" />",
    "            <span className=\"text-sm font-semibold\">为什么这样写</span>",
    "            <span className=\"text-[10px] text-muted-foreground\">任务书 · 大纲 · 断言核验 · claims 账本 · 审稿 · 飞轮</span>",
    "            <span className=\"flex-1\" />",
    "            <Badge variant=\"outline\" className=\"text-[9px]\">{run.claims.filter((c) => c.idx > 0).length} claims</Badge>",
    "            <Badge variant=\"outline\" className=\"text-[9px]\">{run.reviews.length} 审稿</Badge>",
    "            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${whyOpenValue ? \"rotate-180\" : \"\"}`} />",
    "          </button>",
    "        </CollapsibleTrigger>",
    "        <CollapsibleContent>",
    "        <div className=\"grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3\">",
]
new_lines += indent(evidence_cards, "")
new_lines += [
    "        </div>",
    "        </CollapsibleContent>",
    "      </Collapsible>",
    "    </div>",
    "  )",
    "}",
]

open(PATH, "w", encoding="utf-8").write("\n".join(new_lines))
print(f"✅ 重排完成：主体 {len(right_cards) + len(cover_card)} 行 + 证据抽屉 {len(evidence_cards)} 行")
