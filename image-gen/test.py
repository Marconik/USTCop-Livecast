from PIL import Image, ImageDraw, ImageFont
import os

def load_font_with_exact_height(font_path, target_height):
    test_size = 500
    font = ImageFont.truetype(font_path, test_size)

    bbox = font.getbbox("100.8700%")
    actual_height = bbox[3] - bbox[1]

    scale = target_height / actual_height
    new_size = int(test_size * scale)

    return ImageFont.truetype(font_path, new_size)


def render_art_text(
    text,
    font_path,
    font_height_px=200,
    letter_spacing=10,
    fill_color=(255,255,255,255),
    stroke_width=0,
    stroke_color=(0,0,0,255),
    padding=20,
    output_path="output.png"
):


    font = load_font_with_exact_height(font_path, font_height_px)

    # 逐字计算宽度（保证间距精确）
    widths = []
    total_width = 0

    for ch in text:
        bbox = font.getbbox(ch)
        w = bbox[2] - bbox[0]
        widths.append(w)
        total_width += w

    total_width += letter_spacing * (len(text) - 1)

    bbox = font.getbbox(text)
    text_height = bbox[3] - bbox[1]

    img_width = total_width + padding * 2
    img_height = text_height + padding * 2

    img = Image.new("RGBA", (img_width, img_height), (0,0,0,0))
    draw = ImageDraw.Draw(img)

    x = padding
    y = padding - bbox[1]

    for i, ch in enumerate(text):
        draw.text(
            (x, y),
            ch,
            font=font,
            fill=fill_color,
            stroke_width=stroke_width,
            stroke_fill=stroke_color
        )
        x += widths[i] + letter_spacing

    img.save(output_path)

def merge_on_background(
    background_path,          # 底图路径
    img_paths,                # 4张图片
    left_top_positions,       # 前3张左上角坐标
    center_position,          # 第4张中心点坐标
    output_path="result.png"
):
    """
    在已有底图上拼合4张PNG
    保留透明度
    """

    # ===== 读取底图 =====
    canvas = Image.open(background_path).convert("RGBA")

    # ===== 读取叠加图 =====
    images = [Image.open(p).convert("RGBA") for p in img_paths]

    # ===== 放前三张（左上角坐标）=====
    for i in range(4):
        x, y = left_top_positions[i]
        canvas.paste(images[i], (x, y), images[i])

    # ===== 放第四张（中心点坐标）=====
    center_img = images[4]
    cx, cy = center_position

    x4 = int(cx - center_img.width / 2)
    y4 = int(cy - center_img.height / 2)

    canvas.paste(center_img, (x4, y4), center_img)

    canvas.save(output_path)

if __name__ == "__main__":

    font_file1 = "BankGothic Lt BT Light.ttf"
    font_file2="Billiton Gothic.ttf"
    font_file3="Barcelona.ttf"

    name1p="KNRUZ"
    name2p="Cravus"

    score1p=[98.2366,
            99.8888,
             97.3514]
    score2p=[99.2207,
             100.3113,
             99.0685]

    score1pstr=["{:.4f}".format(x) for x in score1p]
    totalscore1p=sum(score1p)
    totalscore1pstr="{:.4f}".format(totalscore1p)
    score2pstr=["{:.4f}".format(x) for x in score2p]
    totalscore2p=sum(score2p)
    totalscore2pstr="{:.4f}".format(totalscore2p)

    #
    for i in range(3):
        render_art_text(
            text=score1pstr[i],
            font_path=font_file1,
            font_height_px=75,
            letter_spacing=20,
            fill_color=(0,0,0,255),
            stroke_width=0,
            output_path="style1A"+str(i)+".png"
        )
        render_art_text(
            text=score2pstr[i],
            font_path=font_file1,
            font_height_px=75,
            letter_spacing=20,
            fill_color=(0,0,0,255),
            stroke_width=0,
            output_path="style2A"+str(i)+".png"
        )

    #
    render_art_text(
        text=totalscore1pstr+"%",
        font_path=font_file2,
        font_height_px=200,
        letter_spacing=5,
        fill_color=(240,240,240,255),
        stroke_width=8,
        stroke_color=(80,160,220,255),
        output_path="style1B.png"
    )
    render_art_text(
        text=totalscore2pstr+"%",
        font_path=font_file2,
        font_height_px=200,
        letter_spacing=5,
        fill_color=(240,240,240,255),
        stroke_width=8,
        stroke_color=(80,160,220,255),
        output_path="style2B.png"
    )

    #
    render_art_text(
        text=name1p,
        font_path=font_file3,
        font_height_px=85,
        letter_spacing=5,
        fill_color=(0,0,0,255),
        stroke_width=8,
        stroke_color=(240,240,240,255),
        output_path="style1C.png"
    )
    render_art_text(
        text=name2p,
        font_path=font_file3,
        font_height_px=85,
        letter_spacing=5,
        fill_color=(0,0,0,255),
        stroke_width=8,
        stroke_color=(240,240,240,255),
        output_path="style2C.png"
    )

    if totalscore1p>totalscore2p:
        pt1="score1.png"
        pt2="score2.png"
    else:
        pt2="score1.png"
        pt1="score2.png"

    merge_on_background(
        background_path=pt1,
        img_paths=[
            "style1A0.png",
            "style1A1.png",
            "style1A2.png",
            "style1B.png",
            "style1C.png"
        ],
        left_top_positions=[
            (620, 890),
            (620, 1250),
            (620, 1610),
            (120,400)
        ],
        center_position=(1263, 133),
        output_path="E:\\USTCop\\score1.png"
    )
    merge_on_background(
        background_path=pt2,
        img_paths=[
            "style2A0.png",
            "style2A1.png",
            "style2A2.png",
            "style2B.png",
            "style2C.png"
        ],
        left_top_positions=[
            (620, 890),
            (620, 1250),
            (620, 1610),
            (120,400)
        ],
        center_position=(1263, 133),
        output_path="E:\\USTCop\\score2.png"
    )