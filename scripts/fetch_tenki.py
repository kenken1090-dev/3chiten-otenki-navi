#!/usr/bin/env python3
"""tenki.jp（日本気象協会）の市区町村ページを取得して weather.json を生成する。

GitHub Actions から定期実行される前提。標準ライブラリのみで動作する。
データ出典: 日本気象協会 tenki.jp（各地点ページへのリンクを places.json に保持）。
"""
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
JST = ZoneInfo("Asia/Tokyo")
WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"]


# --- minimal DOM -----------------------------------------------------------
class Node:
    __slots__ = ("tag", "attrs", "children", "content")

    def __init__(self, tag, attrs):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []
        self.content = []

    def text(self):
        parts = []
        for item in self.content:
            parts.append(item if isinstance(item, str) else item.text())
        return " ".join(parts)

    def has_class(self, name):
        return name in self.attrs.get("class", "").split()

    def find_all(self, tag=None, cls=None, node_id=None):
        out = []
        for c in self.children:
            if (tag is None or c.tag == tag) and \
               (cls is None or c.has_class(cls)) and \
               (node_id is None or c.attrs.get("id") == node_id):
                out.append(c)
            out.extend(c.find_all(tag, cls, node_id))
        return out

    def find(self, tag=None, cls=None, node_id=None):
        found = self.find_all(tag, cls, node_id)
        return found[0] if found else None


VOID = {"img", "br", "hr", "meta", "link", "input", "source"}


class DomBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root", [])
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        self.stack[-1].content.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        self.stack[-1].content.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].content.append(data)


def parse_html(html):
    builder = DomBuilder()
    builder.feed(html)
    return builder.root


# --- extraction helpers ----------------------------------------------------
def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


def to_int(s):
    m = re.search(r"-?\d+", s or "")
    return int(m.group()) if m else None


def to_float(s):
    m = re.search(r"-?\d+(?:\.\d+)?", s or "")
    return float(m.group()) if m else None


def row_cells(table, cls):
    tr = table.find("tr", cls=cls) if table else None
    if tr is None:
        return []
    return [clean(td.text()) for td in tr.find_all("td")]


def parse_day_section(section):
    """today-weather / tomorrow-weather セクションから要約を取り出す。"""
    if section is None:
        return None
    telop_node = section.find("p", cls="weather-telop")
    telop = clean(telop_node.text()) if telop_node else ""
    high = low = None
    for dd in section.find_all("dd"):
        val = dd.find("span", cls="value")
        if val is None:
            continue
        if dd.has_class("high-temp"):
            high = to_int(val.text())
        elif dd.has_class("low-temp"):
            low = to_int(val.text())
    precip_slots = []
    wind = ""
    precip_box = section.find("div", cls="precip-table")
    if precip_box is not None:
        table = precip_box.find("table")
        if table is not None:
            for tr in table.find_all("tr"):
                cells = [clean(td.text()) for td in tr.find_all("td")]
                th = tr.find("th")
                label = clean(th.text()) if th else ""
                if "降水確率" in label:
                    precip_slots = [to_int(c) for c in cells]
                elif "最大風速" in label:
                    wind = cells[0] if cells else ""
    return {"telop": telop, "max": high, "min": low,
            "precipSlots": precip_slots, "wind": wind}


def parse_hourly(root, table_id):
    table = root.find("table", node_id=table_id)
    if table is None:
        return []
    hours = row_cells(table, "hour")
    weather = row_cells(table, "weather")
    temps = row_cells(table, "temperature")
    probs = row_cells(table, "prob-precip")
    precips = row_cells(table, "precipitation")
    humidity = row_cells(table, "humidity")
    wind_dir = row_cells(table, "wind-blow")
    wind_speed = row_cells(table, "wind-speed")
    out = []
    for i, h in enumerate(hours):
        out.append({
            "hour": to_int(h),
            "weather": weather[i] if i < len(weather) else "",
            "temp": to_float(temps[i]) if i < len(temps) else None,
            "prob": to_int(probs[i]) if i < len(probs) else None,
            "precip": to_float(precips[i]) if i < len(precips) else None,
            "humidity": to_int(humidity[i]) if i < len(humidity) else None,
            "windDir": wind_dir[i] if i < len(wind_dir) else "",
            "windSpeed": to_float(wind_speed[i]) if i < len(wind_speed) else None,
        })
    return out


def parse_week(root):
    table = root.find("table", cls="forecast-point-week")
    if table is None:
        return []
    rows = table.find_all("tr")
    if len(rows) < 4:
        return []

    def cells(tr):
        return [clean(td.text()) for td in tr.find_all("td")]

    dates = cells(rows[0])
    telops = []
    for td in rows[1].find_all("td"):
        img = td.find("img")
        telops.append(clean(img.attrs.get("alt", "")) if img is not None
                      else clean(td.text()))
    temps = cells(rows[2])
    probs = cells(rows[3])
    out = []
    for i, d in enumerate(dates):
        nums = re.findall(r"-?\d+", temps[i]) if i < len(temps) else []
        out.append({
            "dateLabel": re.sub(r"\s+", "", d),
            "telop": telops[i] if i < len(telops) else "",
            "max": int(nums[0]) if len(nums) > 0 else None,
            "min": int(nums[1]) if len(nums) > 1 else None,
            "prob": to_int(probs[i]) if i < len(probs) else None,
        })
    return out


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read().decode("utf-8", errors="replace")


def day_label(dt, prefix):
    return {"date": dt.strftime("%Y-%m-%d"),
            "label": f"{prefix} {dt.month}月{dt.day}日",
            "weekday": WEEKDAYS[dt.weekday()]}


def main():
    places = json.loads((ROOT / "places.json").read_text(encoding="utf-8"))
    now = datetime.now(JST)
    today = now.date()
    results = []
    for place in places:
        root = parse_html(fetch(place["url"]))
        today_sec = parse_day_section(root.find("section", cls="today-weather"))
        tomorrow_sec = parse_day_section(root.find("section", cls="tomorrow-weather"))
        if today_sec is None:
            raise RuntimeError(f"today section not found: {place['url']}")
        today_info = {**day_label(today, "今日"), **today_sec}
        tomorrow_info = None
        if tomorrow_sec is not None:
            tomorrow_info = {**day_label(today + timedelta(days=1), "明日"),
                             **tomorrow_sec}
        results.append({
            "name": place["name"],
            "admin": place.get("admin", ""),
            "url": place["url"],
            "today": today_info,
            "tomorrow": tomorrow_info,
            "hourly": parse_hourly(root, "forecast-point-1h-today"),
            "daily": parse_week(root),
        })
    data = {
        "updated": now.strftime("%Y-%m-%dT%H:%M:%S+09:00"),
        "source": "日本気象協会 tenki.jp",
        "sourceUrl": "https://tenki.jp/",
        "places": results,
    }
    out = ROOT / "weather.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    print(f"wrote {out} ({len(results)} places)")


if __name__ == "__main__":
    sys.exit(main())
