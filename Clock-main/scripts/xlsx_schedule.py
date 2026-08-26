#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_MC = "http://schemas.openxmlformats.org/markup-compatibility/2006"
NS_X14AC = "http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac"
NS_XR = "http://schemas.microsoft.com/office/spreadsheetml/2014/revision"
NS_XR2 = "http://schemas.microsoft.com/office/spreadsheetml/2015/revision2"
NS_XR3 = "http://schemas.microsoft.com/office/spreadsheetml/2016/revision3"
NS = f"{{{NS_MAIN}}}"
ET.register_namespace("", NS_MAIN)
ET.register_namespace("mc", NS_MC)
ET.register_namespace("x14ac", NS_X14AC)
ET.register_namespace("xr", NS_XR)
ET.register_namespace("xr2", NS_XR2)
ET.register_namespace("xr3", NS_XR3)

REPO_ROOT = Path(__file__).resolve().parents[2]
BRACKET_OUTPUT = REPO_ROOT / "Broadcast" / "赛程.png"


def workbook_path(group: str) -> Path:
    group_name = group.strip().upper()
    if group_name not in {"A", "B", "C", "D", "E"}:
        raise ValueError("组别必须是 A/B/C/D/E")
    path = REPO_ROOT / f"Group{group_name}.xlsx"
    if not path.exists():
        raise FileNotFoundError(f"找不到赛程表: {path}")
    return path


def col_to_index(col: str) -> int:
    value = 0
    for char in col:
        value = value * 26 + ord(char.upper()) - ord("A") + 1
    return value


def split_ref(ref: str) -> tuple[str, int]:
    match = re.fullmatch(r"([A-Z]+)(\d+)", ref)
    if not match:
        raise ValueError(f"Invalid cell reference: {ref}")
    return match.group(1), int(match.group(2))


def cell_ref(col: str, row_number: int) -> str:
    return f"{col}{row_number}"


def load_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []

    strings: list[str] = []
    for item in root.findall(f"{NS}si"):
        strings.append("".join(text.text or "" for text in item.iter(f"{NS}t")))
    return strings


def read_cell(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.get("t")
    if cell_type == "s":
        value = cell.find(f"{NS}v")
        if value is None or value.text in (None, ""):
            return ""
        return shared_strings[int(value.text)]
    if cell_type == "inlineStr":
        inline = cell.find(f"{NS}is")
        if inline is None:
            return ""
        return "".join(text.text or "" for text in inline.iter(f"{NS}t"))

    value = cell.find(f"{NS}v")
    if value is None or value.text is None:
        return ""
    text = str(value.text).strip()
    return text[:-2] if text.endswith(".0") else text


def row_cells(row: ET.Element, shared_strings: list[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for cell in row.findall(f"{NS}c"):
        ref = cell.get("r")
        if not ref:
            continue
        col, _ = split_ref(ref)
        values[col] = read_cell(cell, shared_strings).strip()
    return values


def row_number(row: ET.Element) -> int:
    value = row.get("r")
    if not value:
        raise ValueError("Row is missing r attribute")
    return int(value)


def round_rows(sheet: ET.Element, shared_strings: list[str]) -> dict[int, list[ET.Element]]:
    sheet_data = sheet.find(f"{NS}sheetData")
    if sheet_data is None:
        raise ValueError("工作表缺少 sheetData")

    grouped: dict[int, list[ET.Element]] = {}
    for row in sheet_data.findall(f"{NS}row"):
        values = row_cells(row, shared_strings)
        round_text = values.get("A", "")
        if not round_text:
            continue
        try:
            round_id = int(float(round_text))
        except ValueError:
            continue
        grouped.setdefault(round_id, []).append(row)
    return grouped


def read_schedule(group: str) -> dict[str, Any]:
    path = workbook_path(group)
    with zipfile.ZipFile(path) as archive:
        shared_strings = load_shared_strings(archive)
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))

    grouped = round_rows(sheet, shared_strings)
    rounds: list[dict[str, Any]] = []
    missing: list[str] = []

    for round_id in range(1, 5):
        rows = grouped.get(round_id, [])[:2]
        if len(rows) < 2:
            missing.append(f"第 {round_id} 回合不足两位选手")
            continue

        players = []
        for slot, row in enumerate(rows, start=1):
            values = row_cells(row, shared_strings)
            number = values.get("B", "")
            name = values.get("C", "")
            if not number or not name:
                missing.append(f"第 {round_id} 回合第 {slot} 位选手缺少序号或名字")
            players.append({"number": number, "id": name})

        rounds.append({"id": round_id, "label": f"回合 {round_id}", "players": players})

    if missing:
        raise ValueError("加载失败：" + "；".join(missing))

    return {
        "group": group.strip().upper(),
        "participants": [player for round_data in rounds for player in round_data["players"]],
        "rounds": rounds,
    }


def ensure_row(sheet_data: ET.Element, row_idx: int) -> ET.Element:
    for row in sheet_data.findall(f"{NS}row"):
        if row_number(row) == row_idx:
            return row

    row = ET.Element(f"{NS}row", {"r": str(row_idx)})
    rows = sheet_data.findall(f"{NS}row")
    insert_at = len(rows)
    for idx, existing in enumerate(rows):
        if row_number(existing) > row_idx:
            insert_at = idx
            break
    sheet_data.insert(insert_at, row)
    return row


def ensure_cell(row: ET.Element, col: str) -> ET.Element:
    ref = cell_ref(col, row_number(row))
    for cell in row.findall(f"{NS}c"):
        if cell.get("r") == ref:
            return cell

    cell = ET.Element(f"{NS}c", {"r": ref})
    cells = row.findall(f"{NS}c")
    insert_at = len(cells)
    col_index = col_to_index(col)
    for idx, existing in enumerate(cells):
        existing_ref = existing.get("r")
        if not existing_ref:
            continue
        existing_col, _ = split_ref(existing_ref)
        if col_to_index(existing_col) > col_index:
            insert_at = idx
            break
    row.insert(insert_at, cell)
    return cell


def clear_cell(row: ET.Element, col: str) -> None:
    ref = cell_ref(col, row_number(row))
    for cell in list(row.findall(f"{NS}c")):
        if cell.get("r") == ref:
            row.remove(cell)
            return


def set_cell(row: ET.Element, col: str, value: Any) -> None:
    if value is None or value == "":
        clear_cell(row, col)
        return

    cell = ensure_cell(row, col)
    for child in list(cell):
        cell.remove(child)

    text = str(value)
    if isinstance(value, (int, float)) or re.fullmatch(r"-?\d+(\.\d+)?", text):
        cell.attrib.pop("t", None)
        node = ET.SubElement(cell, f"{NS}v")
        node.text = text
        return

    cell.set("t", "inlineStr")
    inline = ET.SubElement(cell, f"{NS}is")
    node = ET.SubElement(inline, f"{NS}t")
    node.text = text


def score(value: Any) -> float:
    if value in (None, ""):
        return 0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


def score_text(value: float) -> int | float:
    return int(value) if value.is_integer() else value


def open_sheet(path: Path) -> tuple[bytes, ET.Element, list[str]]:
    with zipfile.ZipFile(path) as archive:
        return archive.read("xl/worksheets/sheet1.xml"), ET.fromstring(archive.read("xl/worksheets/sheet1.xml")), load_shared_strings(archive)


def save_sheet(path: Path, sheet: ET.Element) -> None:
    sheet_xml = normalize_sheet_xml(ET.tostring(sheet, encoding="utf-8", xml_declaration=True))
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as temp:
        temp_path = Path(temp.name)

    try:
        with zipfile.ZipFile(path, "r") as source, zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as target:
            for item in source.infolist():
                if item.filename == "xl/worksheets/sheet1.xml":
                    target.writestr(item, sheet_xml)
                else:
                    target.writestr(item, source.read(item.filename))
        shutil.move(str(temp_path), path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def normalize_sheet_xml(sheet_xml: bytes) -> bytes:
    text = sheet_xml.decode("utf-8")
    text = text.replace("ns1:Ignorable", "mc:Ignorable")

    worksheet_start = text.find("<worksheet")
    if worksheet_start == -1:
        return sheet_xml

    worksheet_end = text.find(">", worksheet_start)
    if worksheet_end == -1:
        return sheet_xml

    namespace_declarations = {
        "xmlns:mc": NS_MC,
        "xmlns:x14ac": NS_X14AC,
        "xmlns:xr": NS_XR,
        "xmlns:xr2": NS_XR2,
        "xmlns:xr3": NS_XR3,
    }
    additions = []
    for name, uri in namespace_declarations.items():
        if f"{name}=" not in text[worksheet_start:worksheet_end]:
            additions.append(f' {name}="{uri}"')

    if additions:
        text = text[:worksheet_end] + "".join(additions) + text[worksheet_end:]

    return text.encode("utf-8")


def update_schedule_image(group: str) -> None:
    sys.path.insert(0, str(REPO_ROOT))
    import generate_bracket as bracket

    group_name = group.strip().upper()
    BRACKET_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        delete=False,
        dir=BRACKET_OUTPUT.parent,
        prefix="赛程.",
        suffix=".tmp.png",
    ) as temp:
        temp_path = Path(temp.name)

    try:
        matches = bracket.complete_advancement(bracket.read_matches(workbook_path(group_name)))
        bracket.generate_bracket(
            matches=matches,
            background_path=REPO_ROOT / "raw.png",
            normal_box_path=REPO_ROOT / "box1.png",
            winner_box_path=REPO_ROOT / "box2.png",
            output_path=temp_path,
            group_label=group_name,
        )
        os.replace(temp_path, BRACKET_OUTPUT)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def rows_for_round(sheet: ET.Element, shared_strings: list[str], round_id: int) -> list[ET.Element]:
    sheet_data = sheet.find(f"{NS}sheetData")
    if sheet_data is None:
        raise ValueError("工作表缺少 sheetData")

    grouped = round_rows(sheet, shared_strings)
    rows = grouped.get(round_id, [])[:2]
    while len(rows) < 2:
        row_idx = 2 + (round_id - 1) * 2 + len(rows)
        row = ensure_row(sheet_data, row_idx)
        set_cell(row, "A", round_id)
        rows.append(row)
    return rows


def write_round(group: str, payload: dict[str, Any]) -> dict[str, Any]:
    round_id = int(payload["roundId"])
    players = payload["players"]
    song_one = payload.get("songOne", [0, 0])
    song_two = payload.get("songTwo", [0, 0])
    song_three = payload.get("songThree", ["", ""])

    path = workbook_path(group)
    _, sheet, shared_strings = open_sheet(path)
    rows = rows_for_round(sheet, shared_strings, round_id)

    totals = [
        score(song_one[0]) + score(song_two[0]) + score(song_three[0]),
        score(song_one[1]) + score(song_two[1]) + score(song_three[1]),
    ]
    winner_index = 0 if totals[0] >= totals[1] else 1

    for idx, row in enumerate(rows):
        player = players[idx]
        set_cell(row, "A", round_id)
        set_cell(row, "B", player.get("number", ""))
        set_cell(row, "C", player.get("id", ""))
        set_cell(row, "D", score_text(score(song_one[idx])))
        set_cell(row, "E", score_text(score(song_two[idx])))
        set_cell(row, "F", score_text(score(song_three[idx])) if round_id == 7 else "")
        set_cell(row, "G", score_text(totals[idx]))
        set_cell(row, "H", 1 if idx == winner_index else 0)

    save_sheet(path, sheet)
    update_schedule_image(group)
    return {"ok": True, "winnerIndex": winner_index, "totals": [score_text(total) for total in totals]}


def write_advancement(group: str, payload: dict[str, Any]) -> dict[str, Any]:
    path = workbook_path(group)
    _, sheet, shared_strings = open_sheet(path)

    for round_data in payload.get("rounds", []):
        round_id = int(round_data["id"])
        rows = rows_for_round(sheet, shared_strings, round_id)
        for idx, row in enumerate(rows):
            player = round_data["players"][idx]
            set_cell(row, "A", round_id)
            set_cell(row, "B", player.get("number", ""))
            set_cell(row, "C", player.get("id", ""))
            for col in ("D", "E", "F", "G", "H"):
                set_cell(row, col, "")

    save_sheet(path, sheet)
    update_schedule_image(group)
    return {"ok": True}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["load", "write-round", "write-advancement"])
    parser.add_argument("--group", required=True)
    args = parser.parse_args()

    try:
        if args.command == "load":
            result = read_schedule(args.group)
        else:
            payload = json.load(sys.stdin)
            if args.command == "write-round":
                result = write_round(args.group, payload)
            else:
                result = write_advancement(args.group, payload)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
