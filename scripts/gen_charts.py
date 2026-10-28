"""生成征文数据图表: Freshness / Mode 参数行为实验（基于应用演示模式实测数据）"""
import json

import matplotlib.font_manager as fm

fm.fontManager.addfont('/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf')
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')

import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['Sarasa Mono SC', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

DATA = json.load(open('/home/z/my-project/scripts/chart-data.json', encoding='utf-8'))
OUT = '/home/z/my-project/download/assets'

# 低饱和配色: 青色主强调 + 蓝灰同族
TEAL = '#2F9E8F'          # 主强调（低饱和青）
SLATE_MID = '#7B8FA3'     # 蓝灰中
SLATE_LIGHT = '#C3CEDA'   # 蓝灰浅
TEXT = '#1F2937'
SUB = '#6B7280'
GRID = '#E5E7EB'


def style_ax(ax):
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color(GRID)
    ax.spines['bottom'].set_color(GRID)
    ax.tick_params(colors=SUB, labelsize=11)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8, alpha=0.6)
    ax.set_axisbelow(True)


# ─────────────────────────────────────────────
# 图 1: Freshness 时效实验
# ─────────────────────────────────────────────
topics = list(DATA['freshness'].keys())
freshness_labels = ['d1\n(今天)', 'd3\n(3天)', 'd7\n(一周)', 'd30\n(一月)']
series = {t: [r['count'] for r in DATA['freshness'][t]] for t in topics}

fig, ax = plt.subplots(figsize=(8.6, 5.2), constrained_layout=True)
x = range(len(freshness_labels))
w = 0.26
colors = [TEAL, SLATE_MID, SLATE_LIGHT]

for i, t in enumerate(topics):
    vals = series[t]
    bars = ax.bar([xi + (i - 1) * w for xi in x], vals, width=w, color=colors[i], label=t, zorder=3)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.12, str(v), ha='center', va='bottom',
                fontsize=10.5, color=TEXT, fontweight='bold')

ax.set_xticks(list(x))
ax.set_xticklabels(freshness_labels, fontsize=11)
ax.set_ylabel('返回资讯条数', fontsize=12, color=TEXT)
ax.set_ylim(0, max(max(v) for v in series.values()) * 1.28)
ax.set_title('Freshness 时效过滤实验：时间窗越宽，可召回资讯越多', fontsize=15, color=TEXT,
             fontweight='bold', pad=14, loc='left')
ax.legend(loc='upper left', bbox_to_anchor=(0.01, 1.0), frameon=False, fontsize=11)
style_ax(ax)
ax.text(0, -0.16, '数据来源：AI 资讯雷达演示模式实测（Mode=0 · Cnt=30 · 参数语义对齐 SearchPro 官方文档）',
        transform=ax.transAxes, fontsize=9.5, color=SUB)
fig.savefig(f'{OUT}/chart-freshness.png', dpi=220, facecolor='white')
plt.close(fig)
print('OK chart-freshness.png')

# ─────────────────────────────────────────────
# 图 2: Mode 信源模式实验（条数 + 平均相关度标注）
# ─────────────────────────────────────────────
topics_m = list(DATA['mode'].keys())
mode_labels = ['Mode=0\n全网网页', 'Mode=1\n权威垂类', 'Mode=2\n混合']

fig, ax = plt.subplots(figsize=(8.6, 5.2), constrained_layout=True)
x = range(len(mode_labels))
w = 0.26

for i, t in enumerate(topics_m):
    rows = DATA['mode'][t]
    counts = [r['count'] for r in rows]
    scores = [r['avg_score'] for r in rows]
    bars = ax.bar([xi + (i - 1) * w for xi in x], counts, width=w, color=colors[i], label=t, zorder=3)
    for b, v, s in zip(bars, counts, scores):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.12, str(v), ha='center', va='bottom',
                fontsize=10.5, color=TEXT, fontweight='bold')
        if v > 0:
            ax.text(b.get_x() + b.get_width() / 2, v / 2, f'{s:.2f}', ha='center', va='center',
                    fontsize=9, color='white', fontweight='bold')

ax.set_xticks(list(x))
ax.set_xticklabels(mode_labels, fontsize=11)
ax.set_ylabel('返回资讯条数（柱内为平均相关度）', fontsize=12, color=TEXT)
ax.set_ylim(0, 8.6)
ax.set_title('Mode 信源模式实验：权威垂类少而精，相关度反而最高', fontsize=15, color=TEXT,
             fontweight='bold', pad=14, loc='left')
ax.legend(loc='upper right', bbox_to_anchor=(0.99, 1.0), frameon=False, fontsize=11)
style_ax(ax)
ax.text(0, -0.16, '数据来源：AI 资讯雷达演示模式实测（Freshness=d30 · Cnt=30 · 柱内数字为平均 score）',
        transform=ax.transAxes, fontsize=9.5, color=SUB)
fig.savefig(f'{OUT}/chart-mode.png', dpi=220, facecolor='white')
plt.close(fig)
print('OK chart-mode.png')
