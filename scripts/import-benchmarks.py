"""Read the supplied workbook into the service's versioned source catalogue.

No workbook edits. Standard library only. Unverified conversion assumptions
and the inferred small-ternary grade are deliberately not activated as rates.
"""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def sheets(path):
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            shared = ["".join(s.itertext()) for s in ET.fromstring(z.read("xl/sharedStrings.xml"))]
        rels = {r.attrib["Id"]: r.attrib["Target"] for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
        book = ET.fromstring(z.read("xl/workbook.xml"))
        for sheet in book.find("x:sheets", NS):
            rid = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = rels[rid]
            target = target.lstrip("/") if target.startswith("/") else "xl/" + target
            rows = []
            for row in ET.fromstring(z.read(target)).findall(".//x:sheetData/x:row", NS):
                cells = {}
                for c in row:
                    col = re.sub(r"\d", "", c.attrib["r"])
                    v = c.find("x:v", NS)
                    value = v.text if v is not None else ""
                    if c.attrib.get("t") == "s":
                        value = shared[int(value)] if value else ""
                    elif c.attrib.get("t") == "inlineStr":
                        value = "".join(c.find("x:is", NS).itertext())
                    elif value:
                        try:
                            value = float(value)
                        except ValueError:
                            pass
                    cells[col] = value
                rows.append(cells)
            yield sheet.attrib["name"], rows


def build(path):
    tabs = dict(sheets(path))
    quotes = []
    for r in tabs["电池之家报价"]:
        if not isinstance(r.get("B"), (int, float)) or not isinstance(r.get("G"), (int, float)):
            continue
        period = str(r["A"])
        current = r.get("I") == "是"
        source_chemistry = r["D"]
        quotes.append({
            "id": "dczj-%s-%02d" % (len(quotes) // 50 + 1, int(r["B"])),
            "source": "电池之家用户截图", "sourceFile": r.get("J", ""),
            "period": period, "capturedAt": "2026-09-29", "periodConfirmed": not current,
            "current": current, "brand": r["C"], "sourceChemistry": source_chemistry,
            "chemistry": "lfp" if source_chemistry == "铁锂" else "ncm",
            "form": "pouch" if "软包" in source_chemistry else "unspecified",
            "capacityAh": r["F"], "price": r["G"], "reusePriceArchived": r.get("H"),
            "unit": "CNY/kWh", "scope": "source_scope_unconfirmed",
            "reviewStatus": "needs_review" if current and r["C"] == "力神" and source_chemistry == "三元" else "usable_reference",
            "note": "kWh分母及整包交付边界待来源确认；仅作行情参考，不等同收购承诺"
        })
    if len(quotes) != 200 or sum(q["current"] for q in quotes) != 50:
        raise ValueError("Expected 200 rows and 50 current rows; inspect source header/flags")
    materials = []
    for r in tabs["价格输入"]:
        if isinstance(r.get("C"), (int, float)) and r.get("G") == "元/吨":
            materials.append({"name": r["A"], "grade": r["B"], "low": r["C"], "high": r["D"], "mid": r["E"],
                              "unit": "CNY/t", "snapshotDate": "2026-09-29", "source": "https://ldcfl.mysteel.com/",
                              "status": "archived_snapshot", "usage": "市场资料；不直接乘整包质量"})
    return {"version": "2026-09-29-import-v1", "quotes": quotes, "weightRates": [], "vehicles": [],
            "materials": materials, "sourceWorkbookSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "sourceNotes": {"nebcycling": "原页面未成功取得，暂定成分参数未进入报价引擎",
                            "smallTernary": "来源分类定义待确认，不从Ni/Co黑粉品位推断电芯类别"}}


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("workbook", type=Path)
    p.add_argument("output", type=Path)
    args = p.parse_args()
    if args.output.exists():
        raise SystemExit("目标已存在。此脚本只用于首次导入历史工作簿；不要覆盖已维护的报价和车辆数据。")
    result = build(args.workbook)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"quotes": len(result["quotes"]), "current": 50, "materials": len(result["materials"])}, ensure_ascii=False))
