"""Every hyperlink in the plan, classified, with its fallbacks.

The build prompt says to check the plan's links against link_catalog.json. That file isn't
on this laptop, so this builds the same catalogue from the docx and, if the file turns up
in sources/, reports the differences.
"""
import json
import re
from collections import defaultdict

import config
from plan_import import LINK, links_in, plain, week_of, yt_id


def link_type(url):
    u = url.lower()
    if "youtube.com/playlist" in u or ("list=" in u and not yt_id(url)):
        return "youtube_playlist"
    if yt_id(url):
        return "video"
    if "gmatclub.com/forum/search.php" in u or "advanced-search" in u:
        return "gmatclub_list"
    if "gmatclub.com/forum/memberlist" in u:
        return "gmatclub_profile"
    if "gmatclub.com" in u:
        return "gmatclub_thread"
    if "mba.com" in u:
        return "mba_com"
    if "amzn.to" in u or "amazon." in u:
        return "store"
    if re.search(r"kutasoftware|mathworksheets4kids|math\.com/students/worksheet", u):
        return "worksheet"
    if "gmatninja.com" in u:
        return "article"
    return "other"


def difficulty(text):
    t = text.lower()
    return "sub-555" if "555" in t else "sub-655" if "655" in t else "mixed" if "mixed" in t else None


FALLBACKS = {
    "gmatclub_list": ["another list on the same topic", "GMAT Club Forum Quiz, same topic"],
    "video": ["open it on YouTube instead", "another video from the same plan week and section"],
    "gmatclub_thread": ["mark it done and move on"],
    "article": ["mark it done and move on"],
    "mba_com": ["none: mba.com is the only source; the mock moves to tomorrow"],
}


def run(paras, tasks):
    used = defaultdict(list)
    for t in tasks:
        p = t["pointer"]
        for u in [p.get("url")] + list((p.get("lists") or {}).values()) + [a["url"] for a in t.get("alternatives", [])]:
            if u:
                used[u].append(t["id"])
    cat = {}
    for p in paras:
        for text, url in links_in(p["raw"]):
            if url.startswith("javascript"):
                continue
            e = cat.setdefault(url, {"url": url, "type": link_type(url), "texts": [], "weeks": set(),
                                     "difficulty": None, "youtube_id": yt_id(url)})
            if text not in e["texts"]:
                e["texts"].append(text)
            e["weeks"].add(week_of(p["i"]))
            e["difficulty"] = e["difficulty"] or difficulty(text)
    for u, e in cat.items():
        e["weeks"] = sorted(e["weeks"])
        e["used_by_tasks"] = used.get(u, [])
        e["fallbacks"] = FALLBACKS.get(e["type"], [])
        m = re.findall(r"selected_search_tags%5B%5D=(\d+)", u)
        if m:
            e["gmatclub_tags"] = [int(x) for x in m]
    entries = sorted(cat.values(), key=lambda e: (e["weeks"][0], e["type"], e["url"]))
    compare = None
    if config.LINK_CATALOG.exists():
        catalog = json.loads(config.LINK_CATALOG.read_text(encoding="utf-8"))["links"]
        by_norm = {norm_url(c["url"]): c for c in catalog}
        matched = set()
        for e in entries:
            c = by_norm.get(norm_url(e["url"]))
            if c:
                matched.add(norm_url(c["url"]))
                e["catalog_id"] = c["id"]
                for k in ("kind", "role_685", "section", "topic", "difficulty", "fallback", "note"):
                    if c.get(k) is not None:
                        e[f"catalog_{k}"] = c[k]
        extras = [c for c in catalog if norm_url(c["url"]) not in matched and not c["url"].startswith("javascript")]
        for c in extras:      # the catalogue's own additions (e.g. the GMAT with CJ list, the Forum Quiz)
            entries.append({"url": c["url"], "type": c["kind"], "texts": [c["anchor"]], "weeks": [],
                            "catalog_id": c["id"], "catalog_note": c.get("note"), "catalog_role_685": c.get("role_685"),
                            "used_by_tasks": used.get(c["url"], []), "fallbacks": c.get("fallback", [])})
        compare = {"catalog_links": len(catalog), "matched": len(matched),
                   "catalog_only": [c["id"] for c in extras],
                   "docx_only": [e["url"] for e in entries if "catalog_id" not in e]}
    return entries, compare


def norm_url(u):
    """Same link, different tails: '?si=…' share codes and '#p123' post anchors don't change the page."""
    u = re.sub(r"[?&]si=[^&#]*", "", u)
    return u.split("#")[0].rstrip("?&/")
