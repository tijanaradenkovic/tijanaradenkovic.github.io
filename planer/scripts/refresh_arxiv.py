"""Build the public Radar feed from the official arXiv RSS feeds."""
import html
import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.request import Request, urlopen

CATEGORIES = ("gr-qc", "hep-th", "math-ph", "math.QA", "quant-ph")
ID = re.compile(r"(?:\d{4}\.\d{4,5}|[a-z.-]+/\d{7})(?:v\d+)?")
DC = "{http://purl.org/dc/elements/1.1/}"


def clean(value):
    return " ".join(html.unescape(re.sub(r"</?(?:p|br|div)(?:\s[^>]*)?\s*/?>", " ", value)).split())


def parse_feed(data, category, date):
    channel = ET.fromstring(data).find("channel")
    if channel is None:
        raise ValueError("RSS channel missing")
    for item in channel.findall("item"):
        identifier = item.findtext("link", "").split("/abs/")[-1].strip()
        if not ID.fullmatch(identifier):
            continue
        identifier = re.sub(r"v\d+$", "", identifier)
        title = clean(item.findtext("title", ""))
        if not title:
            continue
        description = clean(item.findtext("description", ""))
        abstract = re.sub(r"^arXiv:\S+.*?Abstract:\s*", "", description, count=1, flags=re.I)
        yield dict(id=identifier, title=title, abstract=abstract,
                   authors=clean(item.findtext(DC + "creator", "")),
                   categories=[category], date=date)


def refresh(previous):
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=14)).date().isoformat()
    papers = {paper["id"]: paper for paper in previous.get("papers", [])
              if paper["date"] >= cutoff}
    updates = {}
    for category in CATEGORIES:
        request = Request("https://rss.arxiv.org/rss/" + category,
                          headers={"User-Agent": "AcademicPlanner-arXiv-Radar/1.0"})
        try:
            with urlopen(request, timeout=35) as response:
                data = response.read()
            channel = ET.fromstring(data).find("channel")
            date = parsedate_to_datetime(channel.findtext("pubDate") or channel.findtext("lastBuildDate", "")).date().isoformat()
            for paper in parse_feed(data, category, date):
                identifier = paper["id"]
                old = papers.get(identifier)
                if old:
                    paper["categories"] = sorted(set(old["categories"] + paper["categories"]))
                    if old["date"] > paper["date"]:
                        old["categories"] = paper["categories"]
                        continue
                papers[identifier] = paper
            updates[category] = date
        except (OSError, ValueError, AttributeError, ET.ParseError) as error:
            print(f"{category}: {error}", file=sys.stderr)
        time.sleep(3)
    if not updates:
        raise SystemExit("All arXiv requests failed. Keeping the previous feed.")
    return dict(updated=now.date().isoformat(),
                categories={**previous.get("categories", {}), **updates},
                papers=sorted(papers.values(), key=lambda paper: (paper["date"], paper["id"]), reverse=True))


if __name__ == "__main__":
    path = Path(sys.argv[1])
    previous = json.loads(path.read_text()) if path.exists() and path.stat().st_size else {}
    path.write_text(json.dumps(refresh(previous), ensure_ascii=False, separators=(",", ":")))
