#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


IMAGE_GEN_DIR = Path(__file__).resolve().parent
REPO_ROOT = IMAGE_GEN_DIR.parent
DEFAULT_OUTPUT_DIR = REPO_ROOT / "Broadcast"

SCORE_FONT = IMAGE_GEN_DIR / "BankGothic Lt BT Light.ttf"
TOTAL_FONT = IMAGE_GEN_DIR / "Billiton Gothic.ttf"
NAME_FONT = IMAGE_GEN_DIR / "Barcelona.ttf"
WINNER_TEMPLATE = IMAGE_GEN_DIR / "score1.png"
LOSER_TEMPLATE = IMAGE_GEN_DIR / "score2.png"

SONG_POSITIONS = [
    (620, 890),
    (620, 1250),
    (620, 1610),
]
TOTAL_POSITION = (120, 400)
NAME_CENTER_POSITION = (1263, 133)


def load_font_with_exact_height(font_path: Path, target_height: int) -> ImageFont.FreeTypeFont:
    test_size = 500
    font = ImageFont.truetype(str(font_path), test_size)
    bbox = font.getbbox("100.8700%")
    actual_height = bbox[3] - bbox[1]
    scale = target_height / actual_height
    new_size = int(test_size * scale)
    return ImageFont.truetype(str(font_path), new_size)


def render_art_text(
    text: str,
    font_path: Path,
    font_height_px: int = 200,
    letter_spacing: int = 10,
    fill_color: tuple[int, int, int, int] = (255, 255, 255, 255),
    stroke_width: int = 0,
    stroke_color: tuple[int, int, int, int] = (0, 0, 0, 255),
    padding: int = 20,
    output_path: Path | str = "output.png",
) -> None:
    font = load_font_with_exact_height(font_path, font_height_px)

    widths: list[int] = []
    total_width = 0
    for ch in text:
        bbox = font.getbbox(ch)
        width = bbox[2] - bbox[0]
        widths.append(width)
        total_width += width

    total_width += letter_spacing * max(len(text) - 1, 0)

    bbox = font.getbbox(text)
    text_height = bbox[3] - bbox[1]

    img_width = total_width + padding * 2
    img_height = text_height + padding * 2

    img = Image.new("RGBA", (img_width, img_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    x = padding
    y = padding - bbox[1]
    for index, ch in enumerate(text):
        draw.text(
            (x, y),
            ch,
            font=font,
            fill=fill_color,
            stroke_width=stroke_width,
            stroke_fill=stroke_color,
        )
        x += widths[index] + letter_spacing

    img.save(output_path)


def merge_on_background(
    background_path: Path,
    song_image_paths: list[Path],
    total_image_path: Path,
    name_image_path: Path,
    output_path: Path,
) -> None:
    canvas = Image.open(background_path).convert("RGBA")

    for image_path, position in zip(song_image_paths, SONG_POSITIONS):
        image = Image.open(image_path).convert("RGBA")
        canvas.paste(image, position, image)

    total_image = Image.open(total_image_path).convert("RGBA")
    canvas.paste(total_image, TOTAL_POSITION, total_image)

    name_image = Image.open(name_image_path).convert("RGBA")
    x = int(NAME_CENTER_POSITION[0] - name_image.width / 2)
    y = int(NAME_CENTER_POSITION[1] - name_image.height / 2)
    canvas.paste(name_image, (x, y), name_image)

    canvas.save(output_path)


def score(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def format_score(value: Any) -> str:
    return f"{score(value):.4f}"


def read_pair(payload: dict[str, Any], key: str) -> list[Any]:
    values = payload.get(key, ["", ""])
    if not isinstance(values, list) or len(values) < 2:
        return ["", ""]
    return values[:2]


def song_count_from_payload(payload: dict[str, Any]) -> int:
    explicit_count = payload.get("songCount")
    if explicit_count in (2, 3):
        return int(explicit_count)

    song_three = read_pair(payload, "songThree")
    return 3 if any(value not in (None, "") for value in song_three) else 2


def player_name(player: dict[str, Any]) -> str:
    return str(player.get("id") or player.get("name") or "").strip()


def render_player_card(
    name: str,
    song_scores: list[Any],
    total: float,
    background_path: Path,
    temp_dir: Path,
    prefix: str,
    output_path: Path,
) -> None:
    song_image_paths: list[Path] = []
    for index, song_score in enumerate(song_scores):
        path = temp_dir / f"{prefix}_song_{index + 1}.png"
        render_art_text(
            text=format_score(song_score),
            font_path=SCORE_FONT,
            font_height_px=75,
            letter_spacing=20,
            fill_color=(0, 0, 0, 255),
            output_path=path,
        )
        song_image_paths.append(path)

    total_image_path = temp_dir / f"{prefix}_total.png"
    render_art_text(
        text=f"{total:.4f}%",
        font_path=TOTAL_FONT,
        font_height_px=200,
        letter_spacing=5,
        fill_color=(240, 240, 240, 255),
        stroke_width=8,
        stroke_color=(80, 160, 220, 255),
        output_path=total_image_path,
    )

    name_image_path = temp_dir / f"{prefix}_name.png"
    render_art_text(
        text=name,
        font_path=NAME_FONT,
        font_height_px=85,
        letter_spacing=5,
        fill_color=(0, 0, 0, 255),
        stroke_width=8,
        stroke_color=(240, 240, 240, 255),
        output_path=name_image_path,
    )

    merge_on_background(
        background_path=background_path,
        song_image_paths=song_image_paths,
        total_image_path=total_image_path,
        name_image_path=name_image_path,
        output_path=output_path,
    )


def inherit_parent_permissions(path: Path) -> None:
    if platform.system() != "Windows":
        return

    try:
        subprocess.run(
            ["icacls", str(path), "/reset"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise RuntimeError(f"成绩图权限继承失败：{path}") from exc


def generate_score_images(
    payload: dict[str, Any],
    output_dir: Path | str = DEFAULT_OUTPUT_DIR,
) -> dict[str, Any]:
    players = payload.get("players")
    if not isinstance(players, list) or len(players) < 2:
        raise ValueError("成绩图生成失败：缺少两位选手信息")

    song_count = song_count_from_payload(payload)
    song_one = read_pair(payload, "songOne")
    song_two = read_pair(payload, "songTwo")
    song_three = read_pair(payload, "songThree")
    songs = [song_one, song_two, song_three][:song_count]

    player_song_scores = [
        [song[0] for song in songs],
        [song[1] for song in songs],
    ]
    totals = [sum(score(value) for value in scores) for scores in player_song_scores]
    winner_index = 0 if totals[0] >= totals[1] else 1

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    final_paths = [output_path / "score1.png", output_path / "score2.png"]

    with tempfile.TemporaryDirectory(prefix="score-image.", dir=output_path) as temp_name:
        temp_dir = Path(temp_name)
        temp_outputs = [
            temp_dir / "score1.png",
            temp_dir / "score2.png",
        ]

        for index in range(2):
            template = WINNER_TEMPLATE if index == winner_index else LOSER_TEMPLATE
            render_player_card(
                name=player_name(players[index]),
                song_scores=player_song_scores[index],
                total=totals[index],
                background_path=template,
                temp_dir=temp_dir,
                prefix=f"player_{index + 1}",
                output_path=temp_outputs[index],
            )

        for temp_output, final_path in zip(temp_outputs, final_paths):
            os.replace(temp_output, final_path)
            inherit_parent_permissions(final_path)

    return {
        "ok": True,
        "songCount": song_count,
        "winnerIndex": winner_index,
        "totals": [round(total, 4) for total in totals],
        "paths": [str(path) for path in final_paths],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate USTCop live score images.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument(
        "--payload",
        help="JSON payload. If omitted, payload is read from stdin.",
    )
    args = parser.parse_args()

    try:
        payload = json.loads(args.payload) if args.payload else json.load(sys.stdin)
        result = generate_score_images(payload, args.output_dir)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
