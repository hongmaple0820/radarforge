#!/usr/bin/env python3
# ============================================================
# process-y4-frames.py —— y4 帧库后处理：白底原始图 → 透明底标准帧
#   1. 边缘泛洪填充去除纯白背景（tolerance 40，深色描边天然阻挡）
#   2. alpha 收缩 1px（去掉白边光晕，深色房间背景下干净）
#   3. bbox 裁切：脚贴画面底边、水平居中、上/左右留 12px 呼吸边
#   4. 统一缩放到高 1024（宽按比例）
# 输入 scripts/y4-frames-raw/*.png → 输出 public/engine/art-motion/lib/frames/*.png
# 引擎契约（y4_storytime.js）：透明底、脚底在图片底边中间、全身可见
# ============================================================
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from PIL.ImageDraw import floodfill

RAW = Path("scripts/y4-frames-raw")
OUT = Path("public/engine/art-motion/lib/frames")
OUT.mkdir(parents=True, exist_ok=True)

FILL = (255, 0, 255)  # 洋红哨兵色（角色配色中不存在）
THRESH = 40           # 泛洪容差：吸收米白/浅灰背景，深描边阻断
PAD = 12              # 上/左右呼吸边（像素）
TARGET_H = 1024       # 标准化高度


def remove_bg(img: Image.Image) -> Image.Image:
    rgb = img.convert("RGB")
    w, h = rgb.size
    # 沿四边密集播种：处理角色贴边导致背景被分割成多块的情况
    step = 24
    seeds = (
        [(x, 0) for x in range(0, w, step)]
        + [(x, h - 1) for x in range(0, w, step)]
        + [(0, y) for y in range(0, h, step)]
        + [(w - 1, y) for y in range(0, h, step)]
    )
    for xy in seeds:
        px = rgb.getpixel(xy)
        if all(abs(c - FILL[i]) < 12 for i, c in enumerate(px)):
            continue  # 已填充
        if all(c > 255 - THRESH for c in px):
            floodfill(rgb, xy, FILL, thresh=THRESH)

    # alpha：哨兵色 → 0，其余 → 255（numpy 向量化；PixelAccess 赋整数会被按
    # 字节打包成错误颜色，曾导致 alpha 全错——见 worklog）；再收缩 1px 去白边光晕
    arr = np.asarray(rgb)
    mask_bg = np.all(arr == np.array(FILL, dtype=np.uint8), axis=-1)
    alpha_arr = np.where(mask_bg, 0, 255).astype(np.uint8)
    alpha = Image.fromarray(alpha_arr, "L").filter(ImageFilter.MinFilter(3))

    out = img.convert("RGBA")
    out.putalpha(alpha)
    return out


def normalize(img: Image.Image) -> Image.Image:
    a = img.getchannel("A")
    bbox = a.getbbox()  # 非透明内容包围盒（显式按 alpha，不依赖 getbbox 语义）
    if not bbox:
        raise ValueError("抠图后内容为空")
    l, t, r, b = bbox
    cw, ch = r - l, b - t
    # 脚锚居中：自底向上找第一个「不透明跨度 ≥20px」的接触行，取其左右中点为
    # 脚部中心（举臂/坐姿会令 bbox 中心偏离脚位 → 引擎按图片中心锚定会令角色
    # 在姿势切换时跳位；过窄的 1-2px 残影行跳过，避免锚在脚尖残影上）
    apx = a.load()
    feet_cx = None
    for y in range(b - 1, max(0, b - 24) - 1, -1):
        xs = [x for x in range(l, r) if apx[x, y] >= 128]
        if xs and max(xs) - min(xs) >= 20:
            feet_cx = (min(xs) + max(xs)) // 2
            break
        if xs and feet_cx is None:  # 兜底：全部都窄就记最深的窄行
            feet_cx = (min(xs) + max(xs)) // 2
    if feet_cx is None:
        feet_cx = (l + r) // 2
    # 画布以脚为水平中心对称展开（保证举臂不裁切），高 = 角色高 + 顶部呼吸边
    half = max(feet_cx - l, r - feet_cx) + PAD
    canvas = Image.new("RGBA", (half * 2, ch + PAD), (0, 0, 0, 0))
    # y 偏移 = PAD：角色底行（裁切图最后一行）落在 canvas 底边——脚贴底的引擎契约
    canvas.paste(img.crop(bbox), (half - (feet_cx - l), PAD))
    # 高度统一 1024（宽度按比例）
    if canvas.height != TARGET_H:
        ratio = TARGET_H / canvas.height
        canvas = canvas.resize((round(canvas.width * ratio), TARGET_H), Image.LANCZOS)
    return canvas


def main() -> int:
    names = sys.argv[1:] or sorted(p.name for p in RAW.glob("*.png"))
    ok = 0
    for name in names:
        src = RAW / name
        if not src.exists():
            print(f"✗ {name}: 原始图不存在")
            continue
        try:
            img = normalize(remove_bg(Image.open(src)))
            dst = OUT / name
            img.save(dst, optimize=True)
            ratio = img.width / img.height
            print(f"✓ {name}: {img.width}x{img.height}（宽高比 {ratio:.2f}，{(dst.stat().st_size / 1024):.0f}KB）")
            ok += 1
        except Exception as e:  # noqa: BLE001
            print(f"✗ {name}: {e}")
    print(f"完成 {ok}/{len(names)}；输出目录 {OUT}")
    return 0 if ok == len(names) else 1


if __name__ == "__main__":
    sys.exit(main())
