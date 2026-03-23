#!/usr/bin/env python3
"""
AgentDeck Test Report — HTML Generator

Reads vitest JSON, Android JUnit XML, coverage-summary.json, scenario-matrix.json,
and produces a single self-contained HTML dashboard with:
  - Summary cards + history trend sparklines
  - Suite progress bars (Vitest, Android, Apple, Robot)
  - Scenario coverage matrix (user scenarios → test mapping)
  - Expandable test file tables with category tags
  - Coverage per-package gauges + file-level coverage table

Usage:
    python3 scripts/generate-html-report.py
    open coverage/test-report/index.html
"""

import json
import os
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORT_DIR = ROOT / "coverage" / "test-report"
VITEST_JSON = REPORT_DIR / "vitest.json"
COVERAGE_JSON = ROOT / "coverage" / "coverage-summary.json"
ANDROID_XML_DIR = ROOT / "android" / "app" / "build" / "test-results" / "testDebugUnitTest"
SCENARIO_JSON = ROOT / "scripts" / "scenario-matrix.json"
ROBOT_XML = REPORT_DIR / "robot" / "output.xml"
HISTORY_JSON = REPORT_DIR / "history.json"
METADATA_JSON = REPORT_DIR / "run-metadata.json"
SUMMARY_JSON = REPORT_DIR / "summary.json"
OUTPUT_HTML = REPORT_DIR / "index.html"

# ===== Data collection =====

def load_vitest():
    if not VITEST_JSON.exists():
        return None
    with open(VITEST_JSON) as f:
        return json.load(f)

def load_coverage():
    if not COVERAGE_JSON.exists():
        return None
    with open(COVERAGE_JSON) as f:
        return json.load(f)

def load_android_xml():
    suites = []
    if not ANDROID_XML_DIR.exists():
        return suites
    for xml_file in sorted(ANDROID_XML_DIR.glob("TEST-*.xml")):
        tree = ET.parse(xml_file)
        root = tree.getroot()
        suite = {
            "name": root.get("name", xml_file.stem),
            "tests": int(root.get("tests", 0)),
            "failures": int(root.get("failures", 0)),
            "errors": int(root.get("errors", 0)),
            "skipped": int(root.get("skipped", 0)),
            "time": float(root.get("time", 0)),
            "cases": [],
        }
        for tc in root.findall("testcase"):
            failure = tc.find("failure")
            case = {
                "name": tc.get("name", ""),
                "classname": tc.get("classname", ""),
                "time": float(tc.get("time", 0)),
                "status": "failed" if failure is not None else "passed",
                "failure": failure.text if failure is not None else None,
            }
            suite["cases"].append(case)
        suite["passed"] = suite["tests"] - suite["failures"] - suite["errors"] - suite["skipped"]
        suites.append(suite)
    return suites

def load_robot_xml():
    """Parse Robot Framework output.xml into suite/test structure."""
    if not ROBOT_XML.exists():
        return None
    try:
        tree = ET.parse(ROBOT_XML)
    except ET.ParseError:
        # Robot output may have junk after </robot> — truncate and retry
        try:
            raw = ROBOT_XML.read_text(encoding="utf-8")
            end_idx = raw.find("</robot>")
            if end_idx > 0:
                raw = raw[:end_idx + len("</robot>")]
                tree = ET.ElementTree(ET.fromstring(raw))
            else:
                return None
        except Exception:
            return None
    root = tree.getroot()

    # Parse statistics for summary
    stats_el = root.find('.//statistics/total/stat[@name="All Tests"]')
    if stats_el is None:
        # Robot 7+ uses different structure
        stats_el = root.find('.//statistics/total/stat')

    passed = int(stats_el.get('pass', 0)) if stats_el is not None else 0
    failed = int(stats_el.get('fail', 0)) if stats_el is not None else 0
    skipped = int(stats_el.get('skip', 0)) if stats_el is not None else 0

    # Parse individual test cases from <suite> elements
    cases = []
    for test_el in root.iter('test'):
        status_el = test_el.find('status')
        status = status_el.get('status', 'PASS').upper() if status_el is not None else 'PASS'
        # Robot status: PASS/FAIL/SKIP
        case_status = "passed" if status == "PASS" else ("skipped" if status == "SKIP" else "failed")
        msg = ""
        if status_el is not None and status_el.text:
            msg = status_el.text[:300]
        cases.append({
            "name": test_el.get("name", ""),
            "status": case_status,
            "message": msg,
        })

    return {
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "total": passed + failed + skipped,
        "cases": cases,
    }

def load_scenarios():
    if not SCENARIO_JSON.exists():
        return []
    with open(SCENARIO_JSON) as f:
        data = json.load(f)
    return data.get("scenarios", [])

def load_history():
    if not HISTORY_JSON.exists():
        return []
    try:
        with open(HISTORY_JSON) as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return []

def load_metadata():
    if not METADATA_JSON.exists():
        return {}
    try:
        with open(METADATA_JSON) as f:
            return json.load(f)
    except (json.JSONDecodeError, ValueError):
        return {}

def update_history(history, total_passed, total_failed, total_all, lines_pct, metadata):
    commit_sha = os.environ.get("GITHUB_SHA", "local")[:7]
    suites = metadata.get("suites", {}) if metadata else {}
    executed = sorted([name for name, suite in suites.items() if suite.get("executed")])
    history.append({
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
        "commit": commit_sha,
        "total": total_all,
        "passed": total_passed,
        "failed": total_failed,
        "coverage": round(lines_pct, 1),
        "run_profile": metadata.get("run_profile", "unknown") if metadata else "unknown",
        "executed_suites": executed,
    })
    # Keep last 50 entries
    history = history[-50:]
    HISTORY_JSON.write_text(json.dumps(history, indent=2), encoding="utf-8")
    return history

def extract_package_coverage(cov_data):
    """Group per-file coverage into packages."""
    packages = {}
    for filepath, metrics in cov_data.items():
        if filepath == "total":
            continue
        rel = filepath.replace(str(ROOT) + "/", "")
        parts = rel.split("/")
        if len(parts) >= 2 and parts[0] in ("bridge", "plugin", "shared", "hooks"):
            pkg = parts[0]
        else:
            pkg = "other"

        if pkg not in packages:
            packages[pkg] = {"lines": {"total": 0, "covered": 0}, "statements": {"total": 0, "covered": 0},
                             "functions": {"total": 0, "covered": 0}, "branches": {"total": 0, "covered": 0},
                             "files": []}

        for metric in ("lines", "statements", "functions", "branches"):
            m = metrics.get(metric, {})
            packages[pkg][metric]["total"] += m.get("total", 0)
            packages[pkg][metric]["covered"] += m.get("covered", 0)

        packages[pkg]["files"].append({
            "path": rel,
            "lines_pct": metrics.get("lines", {}).get("pct", 0),
            "stmts_pct": metrics.get("statements", {}).get("pct", 0),
            "funcs_pct": metrics.get("functions", {}).get("pct", 0),
            "branch_pct": metrics.get("branches", {}).get("pct", 0),
        })

    for pkg, data in packages.items():
        for metric in ("lines", "statements", "functions", "branches"):
            t = data[metric]["total"]
            c = data[metric]["covered"]
            data[metric]["pct"] = round(c / t * 100, 1) if t > 0 else 0

    return packages


# ===== Test categorization =====

# Test layers: purpose-driven grouping of test files
TEST_LAYERS = [
    {
        "id": "terminal-parsing",
        "name": "Terminal Output Parsing",
        "question": "Claude Code와 Codex CLI의 터미널 출력을 정확히 해석하는가?",
        "icon": "◈",
        "color": "#22d3ee",
        "files": [
            "bridge/src/__tests__/output-parser.test.ts",
            "bridge/src/__tests__/codex-output-parser.test.ts",
            "bridge/src/__tests__/cursor-sync.test.ts",
        ],
    },
    {
        "id": "state-adapter",
        "name": "State Machine & Adapters",
        "question": "에이전트의 상태 전이와 타입별 명령 라우팅이 정확한가?",
        "icon": "◇",
        "color": "#a78bfa",
        "files": [
            "bridge/src/__tests__/state-machine.test.ts",
            "bridge/src/__tests__/adapter.test.ts",
            "shared/src/__tests__/protocol-contract.test.ts",
        ],
    },
    {
        "id": "timeline",
        "name": "Timeline Pipeline",
        "question": "이벤트 타임라인의 저장, 중복 제거, 세션 간 릴레이가 올바른가?",
        "icon": "◆",
        "color": "#f472b6",
        "files": [
            "shared/src/__tests__/timeline.test.ts",
            "bridge/src/__tests__/timeline-integration.test.ts",
            "bridge/src/__tests__/session-timeline-relay.test.ts",
        ],
    },
    {
        "id": "daemon-infra",
        "name": "Daemon & Infrastructure",
        "question": "데몬 싱글톤, 세션 레지스트리, 사용량 릴레이가 안정적인가?",
        "icon": "◉",
        "color": "#fb923c",
        "files": [
            "bridge/src/__tests__/daemon-lifecycle.test.ts",
            "bridge/src/__tests__/session-registry.test.ts",
            "bridge/src/__tests__/usage-relay.test.ts",
            "bridge/src/__tests__/bridge-core.test.ts",
        ],
    },
    {
        "id": "integration",
        "name": "Integration Tests",
        "question": "전체 파이프라인이 실제 서버 환경에서 동작하는가?",
        "icon": "◎",
        "color": "#34d399",
        "files": [
            "bridge/src/__tests__/server-integration.test.ts",
            "bridge/src/__tests__/tier3-integration.test.ts",
        ],
    },
    {
        "id": "plugin-ui",
        "name": "Stream Deck Plugin UI",
        "question": "플러그인의 연결 관리, 옵션 레이아웃, 렌더링이 정확한가?",
        "icon": "▣",
        "color": "#38bdf8",
        "files": [
            "plugin/src/__tests__/connection-manager.test.ts",
            "plugin/src/__tests__/connection-integration.test.ts",
            "plugin/src/__tests__/option-scenario.test.ts",
            "plugin/src/__tests__/renderer-snapshots.test.ts",
            "plugin/src/__tests__/text-utils-and-labels.test.ts",
        ],
    },
    {
        "id": "tui-dashboard",
        "name": "TUI Dashboard",
        "question": "터미널 대시보드의 상태 렌더링과 테라리움 애니메이션이 올바른가?",
        "icon": "▤",
        "color": "#c084fc",
        "files": [
            "bridge/src/__tests__/tui-dashboard.test.ts",
            "bridge/src/__tests__/tui-renderer-snapshots.test.ts",
            "bridge/src/__tests__/tui-terrarium-snapshots.test.ts",
        ],
    },
    {
        "id": "serial-protocol",
        "name": "Serial Protocol",
        "question": "ESP32와의 시리얼 바이트스트림이 정확히 프레이밍되는가?",
        "icon": "▥",
        "color": "#fbbf24",
        "files": [
            "bridge/src/__tests__/esp32-serial-node.test.ts",
        ],
    },
    {
        "id": "display-render",
        "name": "Display Rendering",
        "question": "외부 디스플레이에 전송할 이미지 데이터가 올바른가?",
        "icon": "▦",
        "color": "#f87171",
        "files": [
            "bridge/src/__tests__/pixoo-sprites.test.ts",
        ],
    },
    {
        "id": "hook-install",
        "name": "Hook Installation",
        "question": "Claude Code hook의 설치, 제거, 마이그레이션이 안전한가?",
        "icon": "▧",
        "color": "#4ade80",
        "files": [
            "hooks/src/__tests__/install.test.ts",
        ],
    },
]

# Build reverse lookup: file path -> layer id
_FILE_TO_LAYER = {}
for _layer in TEST_LAYERS:
    for _f in _layer["files"]:
        _FILE_TO_LAYER[_f] = _layer["id"]

def classify_test_file(filepath):
    """Classify test file by layer, with fallback to name pattern."""
    return _FILE_TO_LAYER.get(filepath, "other")

def get_layer_for_file(filepath):
    """Return the layer dict for a file, or None."""
    lid = _FILE_TO_LAYER.get(filepath)
    if lid:
        for layer in TEST_LAYERS:
            if layer["id"] == lid:
                return layer
    return None

def category_badge_html(category):
    """Badge for legacy unit/integration/snapshot or layer-based category."""
    for layer in TEST_LAYERS:
        if layer["id"] == category:
            fg = layer["color"]
            bg = fg + "22"
            return f'<span style="font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:3px;background:{bg};color:{fg};margin-left:0.5rem">{layer["name"]}</span>'
    colors = {
        "unit": ("#38bdf8", "#38bdf822"),
        "integration": ("#a78bfa", "#a78bfa22"),
        "snapshot": ("#f472b6", "#f472b622"),
    }
    fg, bg = colors.get(category, ("#64748b", "#64748b22"))
    return f'<span style="font-size:0.65rem;font-weight:600;padding:1px 6px;border-radius:3px;background:{bg};color:{fg};margin-left:0.5rem">{category}</span>'

def suite_meta(metadata, name):
    suites = metadata.get("suites", {}) if metadata else {}
    meta = suites.get(name, {})
    executed = bool(meta.get("executed"))
    status = meta.get("status") or ("pass" if executed else "not-run")
    return {
        "status": status,
        "executed": executed,
        "note": meta.get("note", ""),
    }

def build_default_metadata(vitest, android, robot):
    return {
        "run_profile": "ad-hoc",
        "suites": {
            "vitest": {"status": "pass" if vitest else "not-run", "executed": bool(vitest), "note": ""},
            "android": {"status": "pass" if android else "not-run", "executed": bool(android), "note": ""},
            "apple": {"status": "not-run", "executed": False, "note": "No Apple result parser input"},
            "robot": {"status": "pass" if robot else "not-run", "executed": bool(robot), "note": ""},
        },
    }

def full_assertion_name(assertion):
    ancestors = assertion.get("ancestorTitles", [])
    title = assertion.get("title", "")
    return " > ".join([*ancestors, title]).strip().lower()

def pattern_matches(text, patterns):
    if not patterns or "*" in patterns:
        return True
    lowered = text.lower()
    return any(pattern.lower() in lowered for pattern in patterns)


# ===== Scenario matrix =====

def build_scenario_results(scenarios, vitest, android_suites, metadata):
    """Cross-reference scenario test mappings against actual test results."""
    suite_status = {
        "vitest": suite_meta(metadata, "vitest"),
        "android": suite_meta(metadata, "android"),
        "apple": suite_meta(metadata, "apple"),
        "robot": suite_meta(metadata, "robot"),
    }
    # Build lookup: relative file path -> {status, passed, failed, total}
    vt_lookup = {}
    if vitest:
        for result in vitest.get("testResults", []):
            rel = result["name"].replace(str(ROOT) + "/", "")
            assertions = result.get("assertionResults", [])
            p = sum(1 for a in assertions if a["status"] == "passed")
            f = sum(1 for a in assertions if a["status"] == "failed")
            vt_lookup[rel] = {"status": result["status"], "passed": p, "failed": f, "total": p + f, "assertions": assertions}

    and_lookup = {}
    for suite in android_suites:
        # Android test files use classname like dev.agentdeck.net.ProtocolTest
        and_lookup[suite["name"]] = {"status": "passed" if suite["failures"] == 0 else "failed",
                                     "passed": suite["passed"], "failed": suite["failures"], "total": suite["tests"],
                                     "cases": suite["cases"]}

    def resolve_entry(entry):
        fpath = entry["file"]
        patterns = entry.get("patterns", ["*"])

        if fpath.startswith("apple/"):
            return {"status": "not-run" if not suite_status["apple"]["executed"] else "missing", "passed": 0, "failed": 0}
        if fpath.startswith("esp32/robot/"):
            return {"status": "not-run" if not suite_status["robot"]["executed"] else "missing", "passed": 0, "failed": 0}

        found = vt_lookup.get(fpath)
        if not found:
            basename = Path(fpath).name
            for vpath, vdata in vt_lookup.items():
                if vpath.endswith(basename):
                    found = vdata
                    break
        if found:
            if not suite_status["vitest"]["executed"]:
                return {"status": "not-run", "passed": 0, "failed": 0}
            if "*" in patterns:
                return {"status": "fail" if found["failed"] else "pass", "passed": found["passed"], "failed": found["failed"]}
            matched = [a for a in found.get("assertions", []) if pattern_matches(full_assertion_name(a), patterns)]
            if not matched:
                return {"status": "missing", "passed": 0, "failed": 0}
            passed = sum(1 for a in matched if a["status"] == "passed")
            failed = sum(1 for a in matched if a["status"] == "failed")
            return {"status": "fail" if failed else "pass", "passed": passed, "failed": failed}

        found = None
        for aname, adata in and_lookup.items():
            fname = Path(fpath).stem.replace("Test", "")
            if fname.lower() in aname.lower():
                found = adata
                break
        if found:
            if not suite_status["android"]["executed"]:
                return {"status": "not-run", "passed": 0, "failed": 0}
            if "*" in patterns:
                return {"status": "fail" if found["failed"] else "pass", "passed": found["passed"], "failed": found["failed"]}
            matched = [c for c in found.get("cases", []) if pattern_matches(c.get("name", ""), patterns)]
            if not matched:
                return {"status": "missing", "passed": 0, "failed": 0}
            passed = sum(1 for c in matched if c["status"] == "passed")
            failed = sum(1 for c in matched if c["status"] == "failed")
            return {"status": "fail" if failed else "pass", "passed": passed, "failed": failed}

        if fpath.startswith("android/") and not suite_status["android"]["executed"]:
            return {"status": "not-run", "passed": 0, "failed": 0}
        if not suite_status["vitest"]["executed"]:
            return {"status": "not-run", "passed": 0, "failed": 0}
        return {"status": "missing", "passed": 0, "failed": 0}

    results = []
    for sc in scenarios:
        sc_result = {"id": sc["id"], "name": sc["name"], "description": sc["description"],
                     "priority": sc.get("priority", "medium"), "gaps": sc.get("gaps", []),
                     "categories": {}}

        for cat in ("unit", "integration", "platform", "e2e"):
            test_entries = sc.get("tests", {}).get(cat, [])
            cat_result = {"tests": [], "passed": 0, "failed": 0, "missing": 0, "not_run": 0, "total": len(test_entries)}

            for entry in test_entries:
                resolved = resolve_entry(entry)
                cat_result["tests"].append({"file": entry["file"], "status": resolved["status"],
                                            "passed": resolved["passed"], "failed": resolved["failed"]})
                if resolved["status"] == "fail":
                    cat_result["failed"] += 1
                elif resolved["status"] == "pass":
                    cat_result["passed"] += 1
                elif resolved["status"] == "not-run":
                    cat_result["not_run"] += 1
                else:
                    cat_result["missing"] += 1

            sc_result["categories"][cat] = cat_result

        results.append(sc_result)
    return results


# ===== HTML generation =====

def pct_color(pct):
    if pct >= 80: return "#22c55e"
    if pct >= 50: return "#eab308"
    if pct >= 20: return "#f97316"
    return "#ef4444"

def gauge_svg(pct, size=48):
    color = pct_color(pct)
    r = size / 2 - 4
    circ = 2 * 3.14159 * r
    offset = circ * (1 - pct / 100)
    return f'''<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}">
      <circle cx="{size/2}" cy="{size/2}" r="{r}" fill="none" stroke="#1e293b" stroke-width="5"/>
      <circle cx="{size/2}" cy="{size/2}" r="{r}" fill="none" stroke="{color}" stroke-width="5"
        stroke-dasharray="{circ}" stroke-dashoffset="{offset}"
        transform="rotate(-90 {size/2} {size/2})" stroke-linecap="round"/>
      <text x="{size/2}" y="{size/2 + 4}" text-anchor="middle" fill="{color}" font-size="11" font-weight="700">{pct:.0f}%</text>
    </svg>'''

def status_badge(status):
    if status in ("passed", "pass"):
        return '<span class="badge pass">PASS</span>'
    elif status in ("failed", "fail", "error"):
        return '<span class="badge fail">FAIL</span>'
    elif status == "not-run":
        return '<span class="badge skip">NOT RUN</span>'
    return '<span class="badge skip">SKIP</span>'

def suite_progress_color(status):
    if status in ("failed", "fail", "error"):
        return "#ef4444"
    if status in ("passed", "pass"):
        return "#22c55e"
    return "#64748b"

def duration_fmt(ms):
    if ms < 1000:
        return f"{ms:.0f}ms"
    s = ms / 1000
    if s < 60:
        return f"{s:.1f}s"
    m = int(s // 60)
    return f"{m}m {s % 60:.0f}s"

def scenario_cell_html(cat_data):
    """Generate a colored cell for a scenario category."""
    t = cat_data["total"]
    if t == 0:
        return '<td class="sc-cell sc-none" title="No tests">—</td>'
    p = cat_data["passed"]
    f = cat_data["failed"]
    m = cat_data["missing"]
    nr = cat_data.get("not_run", 0)
    if f > 0:
        cls = "sc-fail"
        label = f"{p}/{t}"
    elif m > 0 or nr > 0:
        cls = "sc-warn"
        label = f"{p}/{t}"
    else:
        cls = "sc-pass"
        label = f"{p}/{t}"
    title_parts = []
    if p: title_parts.append(f"{p} passed")
    if f: title_parts.append(f"{f} failed")
    if m: title_parts.append(f"{m} not found in CI")
    if nr: title_parts.append(f"{nr} not executed in this report")
    return f'<td class="sc-cell {cls}" title="{", ".join(title_parts)}">{label}</td>'

def write_summary(metadata, total_passed, total_failed, total_all):
    suites_meta = metadata.get("suites", {}) if metadata else {}
    suites = []
    for name in ("vitest", "android", "apple", "robot"):
        meta = suites_meta.get(name, {})
        suites.append({
            "name": name,
            "status": meta.get("status", "not-run"),
            "executed": bool(meta.get("executed")),
            "note": meta.get("note", ""),
        })
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "run_profile": metadata.get("run_profile", "unknown") if metadata else "unknown",
        "suites": suites,
        "total": {
            "passed": total_passed,
            "failed": total_failed,
            "total": total_all,
        },
    }
    SUMMARY_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")

def sparkline_svg(history, key, color, label, w=200, h=40):
    """Generate an SVG sparkline for a history metric."""
    values = [entry.get(key, 0) for entry in history]
    if not values or len(values) < 2:
        return ""
    max_v = max(values) if max(values) > 0 else 1
    min_v = min(values)
    range_v = max_v - min_v if max_v != min_v else 1
    n = len(values)
    points = []
    for i, v in enumerate(values):
        x = (i / (n - 1)) * (w - 8) + 4
        y = h - 6 - ((v - min_v) / range_v) * (h - 12)
        points.append(f"{x:.1f},{y:.1f}")
    polyline = " ".join(points)
    last_v = values[-1]
    # Format display value
    if key == "coverage":
        display = f"{last_v:.1f}%"
    elif key == "total":
        display = str(last_v)
    else:
        display = f"{last_v / values[-1] * 100 if values[-1] else 0:.0f}%" if key == "passed" else str(last_v)
    # For pass rate, compute percentage
    if key == "passed":
        totals = [entry.get("total", 1) for entry in history]
        rate = last_v / totals[-1] * 100 if totals[-1] else 0
        display = f"{rate:.1f}%"

    return f'''<div class="sparkline-card">
      <div class="sparkline-label">{label}</div>
      <svg width="{w}" height="{h}" viewBox="0 0 {w} {h}">
        <polyline points="{polyline}" fill="none" stroke="{color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="{points[-1].split(',')[0]}" cy="{points[-1].split(',')[1]}" r="3" fill="{color}"/>
      </svg>
      <div class="sparkline-value" style="color:{color}">{display}</div>
    </div>'''


def generate_html(vitest, android_suites, cov_data, scenarios, scenario_results, history, metadata, robot=None):
    """Generate tab-based SPA test report."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    vitest_meta = suite_meta(metadata, "vitest")
    android_meta = suite_meta(metadata, "android")
    apple_meta = suite_meta(metadata, "apple")
    robot_meta = suite_meta(metadata, "robot")

    # --- Aggregate stats ---
    vt_passed = vitest["numPassedTests"] if vitest else 0
    vt_failed = vitest["numFailedTests"] if vitest else 0
    vt_total = vitest["numTotalTests"] if vitest else 0
    vt_suites = len(vitest.get("testResults", [])) if vitest else 0
    vt_duration = (vitest["testResults"][-1]["endTime"] - vitest["startTime"]) if vitest and vitest.get("testResults") else 0

    and_passed = sum(s["passed"] for s in android_suites)
    and_failed = sum(s["failures"] + s["errors"] for s in android_suites)
    and_total = sum(s["tests"] for s in android_suites)
    and_duration = sum(s["time"] for s in android_suites) * 1000

    rob_passed = robot["passed"] if robot else 0
    rob_failed = robot["failed"] if robot else 0
    rob_skipped = robot["skipped"] if robot else 0
    rob_total = robot["total"] if robot else 0

    total_passed = vt_passed + and_passed + rob_passed
    total_failed = vt_failed + and_failed + rob_failed
    total_all = vt_total + and_total + rob_total
    total_duration = vt_duration + and_duration

    # Coverage
    cov_total = cov_data.get("total", {}) if cov_data else {}
    lines_pct = cov_total.get("lines", {}).get("pct", 0)
    stmts_pct = cov_total.get("statements", {}).get("pct", 0)
    funcs_pct = cov_total.get("functions", {}).get("pct", 0)
    branch_pct = cov_total.get("branches", {}).get("pct", 0)

    pkg_cov = extract_package_coverage(cov_data) if cov_data else {}

    lines_covered = cov_total.get("lines", {}).get("covered", 0) if cov_total else 0
    lines_total_n = cov_total.get("lines", {}).get("total", 0) if cov_total else 0

    # --- Build vitest file data ---
    vt_file_data = {}
    if vitest:
        for result in vitest["testResults"]:
            name = result["name"].replace(str(ROOT) + "/", "")
            st = result["status"]
            assertions = result.get("assertionResults", [])
            passed = sum(1 for a in assertions if a["status"] == "passed")
            failed = sum(1 for a in assertions if a["status"] == "failed")
            dur = result["endTime"] - result["startTime"]
            vt_file_data[name] = {
                "status": st, "passed": passed, "failed": failed,
                "dur": dur, "assertions": assertions,
            }

    # --- Overall status ---
    overall_status = "PASS" if total_failed == 0 else "FAIL"
    overall_color = "#22c55e" if total_failed == 0 else "#ef4444"

    # --- History sparklines ---
    sparklines_html = ""
    if len(history) >= 2:
        sparklines_html = f'''<div class="sparkline-row">
            {sparkline_svg(history, "total", "#38bdf8", "Total Tests")}
            {sparkline_svg(history, "passed", "#22c55e", "Pass Rate")}
            {sparkline_svg(history, "coverage", "#a78bfa", "Line Coverage")}
        </div>'''

    # --- Build layer tab contents ---
    # Compute which layers have data
    active_layers = []
    assigned_files = set()
    layer_stats = {}
    for layer in TEST_LAYERS:
        layer_files = [f for f in layer["files"] if f in vt_file_data]
        if layer_files:
            assigned_files.update(layer_files)
            lp = sum(vt_file_data[f]["passed"] for f in layer_files)
            lf = sum(vt_file_data[f]["failed"] for f in layer_files)
            ld = sum(vt_file_data[f]["dur"] for f in layer_files)
            layer_stats[layer["id"]] = {"passed": lp, "failed": lf, "total": lp + lf, "dur": ld, "files": layer_files}
            active_layers.append(layer)

    # Helper: build test cases HTML for a file (grouped by top-level describe)
    def build_file_tests_html(name, data):
        """Build HTML for one file with tests grouped by describe blocks."""
        assertions = data["assertions"]
        st = data["status"]
        passed = data["passed"]
        failed = data["failed"]
        dur = data["dur"]
        color = "#22c55e" if st == "passed" else "#ef4444"
        icon = "&#10003;" if st == "passed" else "&#10007;"
        short_name = name.split("__tests__/")[-1] if "__tests__/" in name else name

        # Group assertions by top-level describe (ancestorTitles[0])
        describe_groups = {}
        for a in assertions:
            ancestors = a.get("ancestorTitles", [])
            group_name = ancestors[0] if ancestors else "(top-level)"
            if group_name not in describe_groups:
                describe_groups[group_name] = []
            describe_groups[group_name].append(a)

        groups_html = ""
        for group_name, group_assertions in describe_groups.items():
            g_passed = sum(1 for a in group_assertions if a["status"] == "passed")
            g_failed = sum(1 for a in group_assertions if a["status"] == "failed")
            g_color = "#ef4444" if g_failed else "#22c55e"
            g_icon = "&#10007;" if g_failed else "&#10003;"

            cases_html = ""
            for a in group_assertions:
                a_icon = "&#10003;" if a["status"] == "passed" else "&#10007;"
                a_color = "#22c55e" if a["status"] == "passed" else "#ef4444"
                ancestors = a.get("ancestorTitles", [])
                # Build full path from ancestors (skip first which is the group)
                sub_path = " &#8250; ".join(ancestors[1:]) if len(ancestors) > 1 else ""
                prefix = f'<span class="test-ancestors">{sub_path} &#8250; </span>' if sub_path else ""
                a_dur = f'{a.get("duration", 0)}ms' if a.get("duration") else ""
                fail_msg = ""
                if a.get("failureMessages"):
                    escaped = a["failureMessages"][0][:300].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    fail_msg = f'<div class="fail-msg">{escaped}</div>'
                cases_html += f'''<div class="test-case">
                  <span class="test-icon" style="color:{a_color}">{a_icon}</span>
                  <div class="test-body">
                    <div class="test-title">{prefix}{a["title"]}</div>
                    {fail_msg}
                  </div>
                  <span class="test-dur">{a_dur}</span>
                </div>'''

            groups_html += f'''<div class="describe-group">
              <div class="describe-header">
                <span class="describe-icon" style="color:{g_color}">{g_icon}</span>
                <span class="describe-name">{group_name}</span>
                <span class="describe-stats"><span style="color:#22c55e">{g_passed}</span> / <span style="color:{"#ef4444" if g_failed else "var(--dim)"}">{g_passed + g_failed}</span></span>
              </div>
              <div class="describe-cases">{cases_html}</div>
            </div>'''

        return f'''<div class="file-block">
          <div class="file-header">
            <span class="file-icon" style="color:{color}">{icon}</span>
            <span class="file-name">{short_name}</span>
            <div class="file-stats">
              <span style="color:#22c55e">{passed}</span>
              <span class="file-sep">/</span>
              <span style="color:{"#ef4444" if failed else "var(--dim)"}">{passed + failed}</span>
              <span class="file-dur">{duration_fmt(dur)}</span>
            </div>
          </div>
          {groups_html}
        </div>'''

    # Build each layer tab content
    layer_tab_contents = {}
    for layer in active_layers:
        files_html = ""
        for f in layer_stats[layer["id"]]["files"]:
            files_html += build_file_tests_html(f, vt_file_data[f])
        layer_tab_contents[layer["id"]] = files_html

    # Unassigned files
    unassigned = [f for f in vt_file_data if f not in assigned_files]
    unassigned_html = ""
    if unassigned:
        for f in sorted(unassigned):
            unassigned_html += build_file_tests_html(f, vt_file_data[f])

    # --- Build android tab content ---
    android_tab_html = ""
    for suite in android_suites:
        short_name = suite["name"].replace("dev.agentdeck.", "")
        color = "#22c55e" if suite["failures"] == 0 else "#ef4444"
        icon = "&#10003;" if suite["failures"] == 0 else "&#10007;"

        cases_html = ""
        for c in suite["cases"]:
            c_icon = "&#10003;" if c["status"] == "passed" else "&#10007;"
            c_color = "#22c55e" if c["status"] == "passed" else "#ef4444"
            c_dur = f'{c["time"]*1000:.0f}ms' if c["time"] > 0 else ""
            fail_msg = ""
            if c.get("failure"):
                escaped = c["failure"][:300].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                fail_msg = f'<div class="fail-msg">{escaped}</div>'
            cases_html += f'''<div class="test-case">
              <span class="test-icon" style="color:{c_color}">{c_icon}</span>
              <div class="test-body">
                <div class="test-title">{c["name"]}</div>
                {fail_msg}
              </div>
              <span class="test-dur">{c_dur}</span>
            </div>'''

        android_tab_html += f'''<div class="file-block">
          <div class="file-header">
            <span class="file-icon" style="color:{color}">{icon}</span>
            <span class="file-name">{short_name}</span>
            <div class="file-stats">
              <span style="color:#22c55e">{suite["passed"]}</span>
              <span class="file-sep">/</span>
              <span style="color:{"#ef4444" if suite["failures"] else "var(--dim)"}">{suite["tests"]}</span>
              <span class="file-dur">{duration_fmt(suite["time"]*1000)}</span>
            </div>
          </div>
          <div class="describe-group">
            <div class="describe-cases">{cases_html}</div>
          </div>
        </div>'''

    # --- Build robot tab content ---
    robot_tab_html = ""
    if robot:
        for c in robot["cases"]:
            c_icon = "&#10003;" if c["status"] == "passed" else ("&#9675;" if c["status"] == "skipped" else "&#10007;")
            c_color = "#22c55e" if c["status"] == "passed" else ("#64748b" if c["status"] == "skipped" else "#ef4444")
            fail_msg = ""
            if c.get("message") and c["status"] == "failed":
                escaped = c["message"][:300].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                fail_msg = f'<div class="fail-msg">{escaped}</div>'
            robot_tab_html += f'''<div class="test-case">
              <span class="test-icon" style="color:{c_color}">{c_icon}</span>
              <div class="test-body">
                <div class="test-title">{c["name"]}</div>
                {fail_msg}
              </div>
              <span class="test-dur">{status_badge(c["status"])}</span>
            </div>'''

    # --- Build scenario tab content ---
    scenario_tab_html = ""
    if scenario_results:
        sc_total = len(scenario_results)
        sc_full = sum(1 for s in scenario_results
                      if all(s["categories"][c]["total"] == 0 or (s["categories"][c]["failed"] == 0 and s["categories"][c]["missing"] == 0 and s["categories"][c].get("not_run", 0) == 0)
                             for c in ("unit", "integration", "platform", "e2e"))
                      and any(s["categories"][c]["total"] > 0 for c in ("unit", "integration", "platform", "e2e")))
        sc_gaps = sum(1 for s in scenario_results if s["gaps"])

        scenario_rows = ""
        for sc in scenario_results:
            priority_colors = {"critical": "#ef4444", "high": "#f97316", "medium": "#eab308", "low": "#64748b"}
            p_color = priority_colors.get(sc["priority"], "#64748b")
            unit_cell = scenario_cell_html(sc["categories"]["unit"])
            integ_cell = scenario_cell_html(sc["categories"]["integration"])
            plat_cell = scenario_cell_html(sc["categories"]["platform"])
            e2e_cell = scenario_cell_html(sc["categories"]["e2e"])

            all_passed_sc = sum(sc["categories"][c]["passed"] for c in ("unit", "integration", "platform", "e2e"))
            all_total_sc = sum(sc["categories"][c]["total"] for c in ("unit", "integration", "platform", "e2e"))
            all_failed_sc = sum(sc["categories"][c]["failed"] for c in ("unit", "integration", "platform", "e2e"))
            all_missing_sc = sum(sc["categories"][c]["missing"] for c in ("unit", "integration", "platform", "e2e"))
            all_not_run_sc = sum(sc["categories"][c].get("not_run", 0) for c in ("unit", "integration", "platform", "e2e"))

            if all_total_sc == 0:
                score_cls = "sc-none"
            elif all_failed_sc > 0:
                score_cls = "sc-fail"
            elif all_missing_sc > 0 or all_not_run_sc > 0:
                score_cls = "sc-warn"
            else:
                score_cls = "sc-pass"

            gaps_html = ""
            if sc["gaps"]:
                gaps_items = "".join(f"<li>{g}</li>" for g in sc["gaps"])
                gaps_html = f'<ul class="sc-gaps">{gaps_items}</ul>'

            detail_html = ""
            for cat in ("unit", "integration", "platform", "e2e"):
                for t in sc["categories"][cat]["tests"]:
                    t_icon = "&#10003;" if t["status"] == "pass" else ("&#10007;" if t["status"] == "fail" else "&#9675;" if t["status"] == "not-run" else "?")
                    t_color = "#22c55e" if t["status"] == "pass" else ("#ef4444" if t["status"] == "fail" else "#94a3b8" if t["status"] == "not-run" else "#64748b")
                    t_fail_color = "#ef4444" if t["failed"] else "#64748b"
                    detail_html += f'''<tr class="sc-detail-row" data-scenario="{sc["id"]}" style="display:none">
                        <td style="padding-left:2rem;color:{t_color}">{t_icon}</td>
                        <td class="file-path" style="font-size:0.75rem">{t["file"]}</td>
                        <td>{category_badge_html(cat)}</td>
                        <td style="text-align:right;color:#22c55e;font-size:0.8rem">{t["passed"]}</td>
                        <td style="text-align:right;color:{t_fail_color};font-size:0.8rem">{t["failed"]}</td>
                        <td></td>
                    </tr>'''

            scenario_rows += f'''<tr class="sc-row" onclick="toggleScenario('{sc["id"]}')" style="cursor:pointer">
                <td class="{score_cls}" style="font-weight:600;text-align:center">{all_passed_sc}/{all_total_sc}</td>
                <td>
                    <div style="font-weight:500">{sc["name"]}</div>
                    <div style="font-size:0.75rem;color:var(--dim)">{sc["description"]}</div>
                    {gaps_html}
                </td>
                <td style="text-align:center"><span style="color:{p_color};font-size:0.75rem;font-weight:600;text-transform:uppercase">{sc["priority"]}</span></td>
                {unit_cell}{integ_cell}{plat_cell}{e2e_cell}
            </tr>{detail_html}'''

        scenario_tab_html = f'''<div class="sc-summary-bar">
          <span class="sc-summary-item"><span style="color:#22c55e;font-weight:600">{sc_full}</span> covered</span>
          <span class="sc-summary-item"><span style="color:#eab308;font-weight:600">{sc_total - sc_full}</span> partial/missing</span>
          <span class="sc-summary-item"><span style="color:#f97316;font-weight:600">{sc_gaps}</span> with identified gaps</span>
        </div>
        <table class="scenario-table">
          <thead><tr>
            <th style="width:60px;text-align:center">Score</th>
            <th>Scenario</th>
            <th style="width:70px;text-align:center">Priority</th>
            <th style="width:70px;text-align:center">Unit</th>
            <th style="width:70px;text-align:center">Integ.</th>
            <th style="width:70px;text-align:center">Platform</th>
            <th style="width:70px;text-align:center">E2E</th>
          </tr></thead>
          <tbody>{scenario_rows}</tbody>
        </table>'''

    # --- Build coverage tab content ---
    coverage_tab_html = ""
    if cov_data:
        pkg_cards = ""
        for pkg_name in ("bridge", "plugin", "shared", "hooks"):
            if pkg_name not in pkg_cov:
                continue
            pkg = pkg_cov[pkg_name]
            pkg_cards += f'''<div class="cov-card">
                <div class="cov-card-header">{pkg_name}</div>
                <div class="cov-card-gauges">
                    <div class="gauge-item">{gauge_svg(pkg["lines"]["pct"])}<span>Lines</span></div>
                    <div class="gauge-item">{gauge_svg(pkg["statements"]["pct"])}<span>Stmts</span></div>
                    <div class="gauge-item">{gauge_svg(pkg["functions"]["pct"])}<span>Funcs</span></div>
                    <div class="gauge-item">{gauge_svg(pkg["branches"]["pct"])}<span>Branch</span></div>
                </div>
                <div class="cov-card-detail">{pkg["lines"]["covered"]}/{pkg["lines"]["total"]} lines covered</div>
            </div>'''

        cov_file_rows = ""
        for pkg_name in sorted(pkg_cov.keys()):
            pkg = pkg_cov[pkg_name]
            for fi in sorted(pkg["files"], key=lambda x: x["lines_pct"]):
                bar_w = min(fi["lines_pct"], 100)
                bar_color = pct_color(fi["lines_pct"])
                fi_pkg = fi["path"].split("/")[0] if "/" in fi["path"] else "other"
                cov_file_rows += f'''<tr data-pkg="{fi_pkg}">
                    <td class="file-path">{fi["path"]}</td>
                    <td style="text-align:right;color:{pct_color(fi["stmts_pct"])}">{fi["stmts_pct"]:.0f}%</td>
                    <td style="text-align:right;color:{pct_color(fi["branch_pct"])}">{fi["branch_pct"]:.0f}%</td>
                    <td style="text-align:right;color:{pct_color(fi["funcs_pct"])}">{fi["funcs_pct"]:.0f}%</td>
                    <td style="text-align:right;color:{pct_color(fi["lines_pct"])}">{fi["lines_pct"]:.0f}%</td>
                    <td style="width:100px"><div class="cov-bar"><div class="cov-fill" style="width:{bar_w}%;background:{bar_color}"></div></div></td>
                </tr>'''

        lines_thresh_color = "#22c55e" if lines_pct >= 17 else "#ef4444"
        funcs_thresh_color = "#22c55e" if funcs_pct >= 15 else "#ef4444"
        branch_thresh_color = "#22c55e" if branch_pct >= 14 else "#ef4444"
        stmts_thresh_color = "#22c55e" if stmts_pct >= 16 else "#ef4444"
        coverage_tab_html = f'''<div style="margin-bottom:1rem">
          <div class="threshold"><div class="dot" style="background:{lines_thresh_color}"></div>Lines &ge;17%: {lines_pct:.1f}%</div>
          <div class="threshold"><div class="dot" style="background:{funcs_thresh_color}"></div>Functions &ge;15%: {funcs_pct:.1f}%</div>
          <div class="threshold"><div class="dot" style="background:{branch_thresh_color}"></div>Branches &ge;14%: {branch_pct:.1f}%</div>
          <div class="threshold"><div class="dot" style="background:{stmts_thresh_color}"></div>Statements &ge;16%: {stmts_pct:.1f}%</div>
        </div>
        <div class="cov-cards">{pkg_cards}</div>
        <div class="cov-filter">
          <button class="active" onclick="filterCov('all',this)">All</button>
          <button onclick="filterCov('bridge',this)">bridge</button>
          <button onclick="filterCov('plugin',this)">plugin</button>
          <button onclick="filterCov('shared',this)">shared</button>
          <button onclick="filterCov('uncovered',this)">0% only</button>
        </div>
        <table id="cov-table">
          <thead><tr>
            <th>File</th>
            <th style="text-align:right;width:70px">Stmts</th>
            <th style="text-align:right;width:70px">Branch</th>
            <th style="text-align:right;width:70px">Funcs</th>
            <th style="text-align:right;width:70px">Lines</th>
            <th style="width:110px"></th>
          </tr></thead>
          <tbody>{cov_file_rows}</tbody>
        </table>'''

    # --- Build sidebar nav items ---
    sidebar_items = ""

    # Overview tab
    sidebar_items += f'''<div class="nav-item active" data-tab="overview" onclick="switchTab('overview',this)">
      <div class="nav-indicator" style="background:var(--accent)"></div>
      <div class="nav-label">
        <span class="nav-icon">&#9670;</span>
        <span>Overview</span>
      </div>
      <span class="nav-badge" style="color:{overall_color}">{overall_status}</span>
    </div>'''

    # Layer tabs
    for layer in active_layers:
        ls = layer_stats[layer["id"]]
        l_status_color = "#22c55e" if ls["failed"] == 0 else "#ef4444"
        l_badge = f'{ls["passed"]}/{ls["total"]}'
        sidebar_items += f'''<div class="nav-item" data-tab="layer-{layer["id"]}" onclick="switchTab('layer-{layer["id"]}',this)">
          <div class="nav-indicator" style="background:{layer["color"]}"></div>
          <div class="nav-label">
            <span class="nav-icon">{layer["icon"]}</span>
            <span>{layer["name"]}</span>
          </div>
          <span class="nav-badge" style="color:{l_status_color}">{l_badge}</span>
        </div>'''

    # Unassigned vitest files tab
    if unassigned:
        ua_p = sum(vt_file_data[f]["passed"] for f in unassigned)
        ua_f = sum(vt_file_data[f]["failed"] for f in unassigned)
        ua_color = "#22c55e" if ua_f == 0 else "#ef4444"
        sidebar_items += f'''<div class="nav-item" data-tab="layer-other" onclick="switchTab('layer-other',this)">
          <div class="nav-indicator" style="background:var(--dim)"></div>
          <div class="nav-label">
            <span class="nav-icon">&#9675;</span>
            <span>Other Tests</span>
          </div>
          <span class="nav-badge" style="color:{ua_color}">{ua_p}/{ua_p + ua_f}</span>
        </div>'''

    # Android tab
    and_badge_color = "#22c55e" if and_failed == 0 and and_total > 0 else ("#ef4444" if and_failed > 0 else "var(--dim)")
    sidebar_items += f'''<div class="nav-item nav-separator" data-tab="android" onclick="switchTab('android',this)">
      <div class="nav-indicator" style="background:#a3e635"></div>
      <div class="nav-label">
        <span class="nav-icon">&#9635;</span>
        <span>Android</span>
      </div>
      <span class="nav-badge" style="color:{and_badge_color}">{and_passed}/{and_total if and_total else "—"}</span>
    </div>'''

    # Robot tab
    rob_badge_color = "#22c55e" if rob_failed == 0 and rob_total > 0 else ("#ef4444" if rob_failed > 0 else "var(--dim)")
    sidebar_items += f'''<div class="nav-item" data-tab="robot" onclick="switchTab('robot',this)">
      <div class="nav-indicator" style="background:#fb923c"></div>
      <div class="nav-label">
        <span class="nav-icon">&#9641;</span>
        <span>Robot</span>
      </div>
      <span class="nav-badge" style="color:{rob_badge_color}">{rob_passed}/{rob_total if rob_total else "—"}</span>
    </div>'''

    # Scenarios tab
    if scenario_results:
        sidebar_items += f'''<div class="nav-item nav-separator" data-tab="scenarios" onclick="switchTab('scenarios',this)">
          <div class="nav-indicator" style="background:#f472b6"></div>
          <div class="nav-label">
            <span class="nav-icon">&#9638;</span>
            <span>Scenarios</span>
          </div>
          <span class="nav-badge" style="color:var(--dim)">{len(scenario_results)}</span>
        </div>'''

    # Coverage tab
    if cov_data:
        sidebar_items += f'''<div class="nav-item" data-tab="coverage" onclick="switchTab('coverage',this)">
          <div class="nav-indicator" style="background:#a78bfa"></div>
          <div class="nav-label">
            <span class="nav-icon">&#9636;</span>
            <span>Coverage</span>
          </div>
          <span class="nav-badge" style="color:{pct_color(lines_pct)}">{lines_pct:.0f}%</span>
        </div>'''

    # --- Build tab panels ---
    tab_panels = ""

    # Overview panel
    tab_panels += f'''<div class="tab-panel active" id="tab-overview">
      <div class="summary">
        <div class="card">
          <div class="card-label">Status</div>
          <div class="card-value" style="color:{overall_color}">{overall_status}</div>
          <div class="card-sub">{total_all} executed tests</div>
        </div>
        <div class="card">
          <div class="card-label">Passed</div>
          <div class="card-value" style="color:#22c55e">{total_passed}</div>
          <div class="card-sub">{total_passed/total_all*100 if total_all else 0:.1f}% pass rate</div>
        </div>
        <div class="card">
          <div class="card-label">Failed</div>
          <div class="card-value" style="color:{"#ef4444" if total_failed else "#64748b"}">{total_failed}</div>
          <div class="card-sub">&nbsp;</div>
        </div>
        <div class="card">
          <div class="card-label">Duration</div>
          <div class="card-value" style="color:var(--accent)">{duration_fmt(total_duration)}</div>
          <div class="card-sub">{duration_fmt(vt_duration)} vitest + {duration_fmt(and_duration)} android</div>
        </div>
        <div class="card">
          <div class="card-label">TS Line Coverage</div>
          <div class="card-value" style="color:{pct_color(lines_pct)}">{lines_pct:.1f}%</div>
          <div class="card-sub">{lines_covered:,}/{lines_total_n:,} TypeScript lines</div>
        </div>
      </div>

      {sparklines_html}

      <div class="suite-bars">
        <div class="suite-bar">
          <div class="suite-bar-header">
            <h3>Vitest</h3>
            {status_badge(vitest_meta["status"])}
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:{vt_passed/vt_total*100 if vt_total else 0:.1f}%;background:{suite_progress_color(vitest_meta["status"])}"></div>
          </div>
          <div class="suite-stats">
            <span>Pass {vt_passed}</span>
            <span>Fail {vt_failed}</span>
            <span>{vt_suites} files</span>
            <span>{vitest_meta["note"] or duration_fmt(vt_duration)}</span>
          </div>
        </div>
        <div class="suite-bar">
          <div class="suite-bar-header">
            <h3>Android</h3>
            {status_badge(android_meta["status"])}
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:{and_passed/and_total*100 if and_total else 0:.1f}%;background:{suite_progress_color(android_meta["status"])}"></div>
          </div>
          <div class="suite-stats">
            <span>Pass {and_passed}</span>
            <span>Fail {and_failed}</span>
            <span>{len(android_suites)} files</span>
            <span>{android_meta["note"] or duration_fmt(and_duration)}</span>
          </div>
        </div>
        <div class="suite-bar">
          <div class="suite-bar-header">
            <h3>Apple (XCTest)</h3>
            {status_badge(apple_meta["status"])}
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:0;background:{suite_progress_color(apple_meta["status"])}"></div></div>
          <div class="suite-stats"><span style="color:var(--dim)">{apple_meta["note"] or "Requires macOS runner"}</span></div>
        </div>
        <div class="suite-bar">
          <div class="suite-bar-header">
            <h3>Robot Framework</h3>
            {status_badge(robot_meta["status"])}
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:{rob_passed/rob_total*100 if rob_total else 0:.1f}%;background:{suite_progress_color(robot_meta["status"])}"></div>
          </div>
          <div class="suite-stats">
            {f"<span>Pass {rob_passed}</span><span>Fail {rob_failed}</span><span>Skip {rob_skipped}</span>" if robot else f'<span style="color:var(--dim)">{robot_meta["note"] or "Not available"}</span>'}
          </div>
        </div>
      </div>
    </div>'''

    # Layer panels
    for layer in active_layers:
        ls = layer_stats[layer["id"]]
        l_status = "PASS" if ls["failed"] == 0 else "FAIL"
        l_status_color = "#22c55e" if ls["failed"] == 0 else "#ef4444"
        content = layer_tab_contents.get(layer["id"], "")
        tab_panels += f'''<div class="tab-panel" id="tab-layer-{layer["id"]}">
          <div class="layer-tab-header" style="border-left:4px solid {layer["color"]}">
            <div class="layer-tab-title">
              <span style="color:{layer["color"]};font-size:1.25rem;margin-right:0.5rem">{layer["icon"]}</span>
              <span style="font-size:1.1rem;font-weight:600">{layer["name"]}</span>
              <span class="layer-tab-badge" style="color:{l_status_color}">{l_status}</span>
            </div>
            <div class="layer-tab-question">{layer["question"]}</div>
            <div class="layer-tab-stats">
              <span style="color:#22c55e">{ls["passed"]} passed</span>
              <span style="color:{"#ef4444" if ls["failed"] else "var(--dim)"}">{ls["failed"]} failed</span>
              <span style="color:var(--dim)">{len(ls["files"])} files</span>
              <span style="color:var(--dim)">{duration_fmt(ls["dur"])}</span>
            </div>
          </div>
          {content}
        </div>'''

    # Unassigned panel
    if unassigned:
        ua_p = sum(vt_file_data[f]["passed"] for f in unassigned)
        ua_f = sum(vt_file_data[f]["failed"] for f in unassigned)
        tab_panels += f'''<div class="tab-panel" id="tab-layer-other">
          <div class="layer-tab-header" style="border-left:4px solid var(--dim)">
            <div class="layer-tab-title">
              <span style="color:var(--dim);font-size:1.25rem;margin-right:0.5rem">&#9675;</span>
              <span style="font-size:1.1rem;font-weight:600">Other Tests</span>
            </div>
            <div class="layer-tab-question">Uncategorized test files</div>
            <div class="layer-tab-stats">
              <span style="color:#22c55e">{ua_p} passed</span>
              <span style="color:{"#ef4444" if ua_f else "var(--dim)"}">{ua_f} failed</span>
              <span style="color:var(--dim)">{len(unassigned)} files</span>
            </div>
          </div>
          {unassigned_html}
        </div>'''

    # Android panel
    tab_panels += f'''<div class="tab-panel" id="tab-android">
      <div class="layer-tab-header" style="border-left:4px solid #a3e635">
        <div class="layer-tab-title">
          <span style="color:#a3e635;font-size:1.25rem;margin-right:0.5rem">&#9635;</span>
          <span style="font-size:1.1rem;font-weight:600">Android</span>
          <span class="layer-tab-badge" style="color:{and_badge_color}">{status_badge(android_meta["status"])}</span>
        </div>
        <div class="layer-tab-question">JUnit + Robolectric &middot; {len(android_suites)} files &middot; {and_total} tests</div>
      </div>
      {android_tab_html if android_suites else '<div class="empty-state">No Android test results available.</div>'}
    </div>'''

    # Robot panel
    tab_panels += f'''<div class="tab-panel" id="tab-robot">
      <div class="layer-tab-header" style="border-left:4px solid #fb923c">
        <div class="layer-tab-title">
          <span style="color:#fb923c;font-size:1.25rem;margin-right:0.5rem">&#9641;</span>
          <span style="font-size:1.1rem;font-weight:600">Robot Framework</span>
          <span class="layer-tab-badge">{status_badge(robot_meta["status"])}</span>
        </div>
        <div class="layer-tab-question">ESP32 build verification &middot; {rob_total} tests (no-hw)</div>
      </div>
      {robot_tab_html if robot else '<div class="empty-state">No Robot Framework test results available.</div>'}
    </div>'''

    # Scenario panel
    if scenario_results:
        tab_panels += f'''<div class="tab-panel" id="tab-scenarios">
          <div class="layer-tab-header" style="border-left:4px solid #f472b6">
            <div class="layer-tab-title">
              <span style="color:#f472b6;font-size:1.25rem;margin-right:0.5rem">&#9638;</span>
              <span style="font-size:1.1rem;font-weight:600">Scenario Coverage</span>
            </div>
            <div class="layer-tab-question">User scenario mapping against actual test results</div>
          </div>
          {scenario_tab_html}
        </div>'''

    # Coverage panel
    if cov_data:
        tab_panels += f'''<div class="tab-panel" id="tab-coverage">
          <div class="layer-tab-header" style="border-left:4px solid #a78bfa">
            <div class="layer-tab-title">
              <span style="color:#a78bfa;font-size:1.25rem;margin-right:0.5rem">&#9636;</span>
              <span style="font-size:1.1rem;font-weight:600">Coverage</span>
            </div>
            <div class="layer-tab-question">v8 provider &middot; {lines_total_n:,} lines tracked</div>
          </div>
          {coverage_tab_html}
        </div>'''

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AgentDeck Test Report</title>
<style>
:root {{ --bg: #0f172a; --surface: #1e293b; --surface2: #334155; --text: #e2e8f0; --dim: #64748b; --accent: #38bdf8; --sidebar-w: 240px; }}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', 'Inter', system-ui, sans-serif; line-height: 1.5; }}

/* Layout */
.app {{ display: flex; min-height: 100vh; }}
.sidebar {{ width: var(--sidebar-w); position: fixed; top: 0; left: 0; bottom: 0; background: var(--surface); border-right: 1px solid var(--surface2); overflow-y: auto; z-index: 10; display: flex; flex-direction: column; }}
.sidebar-header {{ padding: 1.25rem 1rem 1rem; border-bottom: 1px solid var(--surface2); }}
.sidebar-header h1 {{ font-size: 1rem; font-weight: 700; }}
.sidebar-header .subtitle {{ color: var(--dim); font-size: 0.7rem; margin-top: 0.25rem; }}
.sidebar-nav {{ flex: 1; padding: 0.5rem 0; overflow-y: auto; }}
.content {{ margin-left: var(--sidebar-w); flex: 1; padding: 2rem; min-width: 0; }}

/* Nav items */
.nav-item {{ display: flex; align-items: center; padding: 0.5rem 0.75rem; cursor: pointer; transition: background 0.15s; position: relative; gap: 0.5rem; }}
.nav-item:hover {{ background: var(--surface2); }}
.nav-item.active {{ background: rgba(56, 189, 248, 0.08); }}
.nav-item.active .nav-indicator {{ opacity: 1; }}
.nav-indicator {{ width: 3px; border-radius: 2px; align-self: stretch; opacity: 0.3; transition: opacity 0.15s; flex-shrink: 0; }}
.nav-label {{ display: flex; align-items: center; gap: 0.4rem; flex: 1; min-width: 0; }}
.nav-label span:last-child {{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8rem; }}
.nav-icon {{ font-size: 0.9rem; flex-shrink: 0; width: 1.2rem; text-align: center; }}
.nav-badge {{ font-size: 0.7rem; font-weight: 600; flex-shrink: 0; }}
.nav-separator {{ margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--surface2); }}

/* Tab panels */
.tab-panel {{ display: none; animation: fadeIn 0.2s ease; }}
.tab-panel.active {{ display: block; }}
@keyframes fadeIn {{ from {{ opacity: 0; transform: translateY(4px); }} to {{ opacity: 1; transform: translateY(0); }} }}

/* Layer tab header */
.layer-tab-header {{ padding: 1.25rem; background: var(--surface); border-radius: 12px; margin-bottom: 1.5rem; }}
.layer-tab-title {{ display: flex; align-items: center; gap: 0.25rem; }}
.layer-tab-badge {{ font-size: 0.8rem; font-weight: 700; margin-left: 0.75rem; }}
.layer-tab-question {{ color: var(--dim); font-size: 0.85rem; margin-top: 0.5rem; }}
.layer-tab-stats {{ display: flex; gap: 1.25rem; margin-top: 0.75rem; font-size: 0.8rem; }}

/* File blocks */
.file-block {{ background: var(--surface); border-radius: 10px; margin-bottom: 0.75rem; overflow: hidden; }}
.file-header {{ display: flex; align-items: center; padding: 0.75rem 1rem; gap: 0.5rem; }}
.file-icon {{ font-size: 0.9rem; font-weight: 600; flex-shrink: 0; }}
.file-name {{ font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8rem; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
.file-stats {{ display: flex; align-items: center; gap: 0.25rem; font-size: 0.8rem; flex-shrink: 0; }}
.file-sep {{ color: var(--dim); }}
.file-dur {{ color: var(--dim); font-size: 0.75rem; margin-left: 0.5rem; }}

/* Describe groups */
.describe-group {{ border-top: 1px solid #1a2332; }}
.describe-header {{ display: flex; align-items: center; padding: 0.5rem 1rem; gap: 0.5rem; background: rgba(0,0,0,0.15); }}
.describe-icon {{ font-size: 0.8rem; flex-shrink: 0; }}
.describe-name {{ font-size: 0.8rem; font-weight: 600; flex: 1; }}
.describe-stats {{ font-size: 0.75rem; color: var(--dim); }}
.describe-cases {{ padding: 0 0 0.25rem; }}

/* Test cases */
.test-case {{ display: flex; align-items: flex-start; padding: 0.3rem 1rem 0.3rem 2rem; gap: 0.5rem; }}
.test-icon {{ font-size: 0.75rem; flex-shrink: 0; margin-top: 2px; }}
.test-body {{ flex: 1; min-width: 0; }}
.test-title {{ font-size: 0.8rem; }}
.test-ancestors {{ color: var(--dim); font-size: 0.75rem; }}
.test-dur {{ font-size: 0.7rem; color: var(--dim); flex-shrink: 0; }}

/* Summary cards */
.summary {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }}
.card {{ background: var(--surface); border-radius: 12px; padding: 1.25rem; }}
.card-label {{ color: var(--dim); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }}
.card-value {{ font-size: 2rem; font-weight: 700; }}
.card-sub {{ color: var(--dim); font-size: 0.8rem; margin-top: 0.25rem; }}

/* Sparkline row */
.sparkline-row {{ display: flex; gap: 1.5rem; margin-bottom: 2rem; padding: 0.75rem 1rem; background: var(--surface); border-radius: 12px; }}
.sparkline-card {{ flex: 1; text-align: center; }}
.sparkline-label {{ font-size: 0.7rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }}
.sparkline-value {{ font-size: 0.85rem; font-weight: 600; margin-top: 0.25rem; }}

/* Suite bars */
.suite-bars {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 2rem; }}
.suite-bar {{ background: var(--surface); border-radius: 12px; padding: 1rem 1.25rem; }}
.suite-bar-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }}
.suite-bar-header h3 {{ font-size: 0.95rem; font-weight: 600; }}
.badge {{ font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; display: inline-block; }}
.badge.pass {{ background: #16a34a22; color: #22c55e; }}
.badge.fail {{ background: #dc262622; color: #ef4444; }}
.badge.skip {{ background: #ca8a0422; color: #eab308; }}
.progress-bar {{ height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; }}
.progress-fill {{ height: 100%; border-radius: 3px; transition: width 0.5s; }}
.suite-stats {{ display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.8rem; color: var(--dim); }}

/* Fail messages */
.fail-msg {{ color: #ef4444; font-size: 0.75rem; margin-top: 0.25rem; font-family: monospace; white-space: pre-wrap; max-height: 100px; overflow: auto; }}

/* Coverage cards */
.cov-cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }}
.cov-card {{ background: var(--surface); border-radius: 12px; padding: 1rem; }}
.cov-card-header {{ font-weight: 600; font-size: 0.95rem; margin-bottom: 0.75rem; }}
.cov-card-gauges {{ display: flex; justify-content: space-around; }}
.gauge-item {{ text-align: center; }}
.gauge-item span {{ display: block; font-size: 0.7rem; color: var(--dim); margin-top: 2px; }}
.cov-card-detail {{ text-align: center; color: var(--dim); font-size: 0.75rem; margin-top: 0.75rem; }}
.cov-bar {{ height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; }}
.cov-fill {{ height: 100%; border-radius: 3px; }}
.cov-filter {{ margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }}
.cov-filter button {{ background: var(--surface); color: var(--text); border: 1px solid var(--surface2); padding: 4px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; }}
.cov-filter button.active {{ background: var(--accent); color: var(--bg); border-color: var(--accent); }}

/* Threshold indicators */
.threshold {{ display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; background: var(--surface); padding: 4px 12px; border-radius: 6px; margin-right: 0.5rem; margin-bottom: 0.5rem; }}
.threshold .dot {{ width: 8px; height: 8px; border-radius: 50%; }}

/* Tables */
table {{ width: 100%; border-collapse: collapse; }}
th {{ text-align: left; color: var(--dim); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface2); }}
td {{ padding: 0.5rem 0.75rem; border-bottom: 1px solid #1e293b; font-size: 0.85rem; }}
.file-path {{ font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8rem; }}

/* Scenario matrix */
.scenario-table {{ margin-top: 1rem; }}
.sc-row:hover {{ background: var(--surface); cursor: pointer; }}
.sc-cell {{ text-align: center; font-size: 0.85rem; font-weight: 600; border-radius: 4px; }}
.sc-pass {{ color: #22c55e; }}
.sc-fail {{ color: #ef4444; }}
.sc-warn {{ color: #eab308; }}
.sc-none {{ color: var(--dim); }}
.sc-gaps {{ list-style: none; margin-top: 0.25rem; }}
.sc-gaps li {{ font-size: 0.7rem; color: #f97316; padding-left: 0.75rem; position: relative; }}
.sc-gaps li::before {{ content: "!"; position: absolute; left: 0; font-weight: 700; }}
.sc-detail-row {{ background: #0c1222; }}
.sc-detail-row td {{ border-bottom: 1px solid #1a2332; }}
.sc-summary-bar {{ display: flex; gap: 1.5rem; margin-bottom: 1rem; margin-top: 1rem; }}
.sc-summary-item {{ font-size: 0.85rem; }}

/* Empty state */
.empty-state {{ color: var(--dim); font-size: 0.9rem; padding: 2rem; text-align: center; }}

/* Responsive: collapse sidebar on small screens */
@media (max-width: 768px) {{
  .sidebar {{ width: 100%; position: relative; border-right: none; border-bottom: 1px solid var(--surface2); }}
  .sidebar-nav {{ display: flex; flex-wrap: wrap; padding: 0.5rem; gap: 0.25rem; }}
  .nav-item {{ padding: 0.35rem 0.6rem; border-radius: 6px; }}
  .nav-indicator {{ display: none; }}
  .nav-separator {{ margin-top: 0; padding-top: 0; border-top: none; }}
  .app {{ flex-direction: column; }}
  .content {{ margin-left: 0; padding: 1rem; }}
  .summary {{ grid-template-columns: repeat(2, 1fr); }}
  .sparkline-row {{ flex-direction: column; }}
}}
</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="sidebar-header">
      <h1>AgentDeck Test Report</h1>
      <div class="subtitle">Generated {now}<br>profile {metadata.get("run_profile", "unknown") if metadata else "unknown"}</div>
    </div>
    <nav class="sidebar-nav">
      {sidebar_items}
    </nav>
  </aside>
  <main class="content">
    {tab_panels}
  </main>
</div>

<script>
function switchTab(tabId, navEl) {{
  // Deactivate all
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  // Activate selected
  navEl.classList.add('active');
  const panel = document.getElementById('tab-' + tabId);
  if (panel) panel.classList.add('active');
  // Update URL hash
  history.replaceState(null, '', '#' + tabId);
}}

function filterCov(pkg, btn) {{
  document.querySelectorAll('.cov-filter button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const rows = document.querySelectorAll('#cov-table tbody tr');
  rows.forEach(r => {{
    const path = r.querySelector('.file-path')?.textContent || '';
    const linesPct = parseFloat(r.querySelectorAll('td')[4]?.textContent) || 0;
    if (pkg === 'all') {{ r.style.display = ''; }}
    else if (pkg === 'uncovered') {{ r.style.display = linesPct === 0 ? '' : 'none'; }}
    else {{ r.style.display = path.startsWith(pkg + '/') ? '' : 'none'; }}
  }});
}}

function toggleScenario(id) {{
  const rows = document.querySelectorAll('.sc-detail-row[data-scenario="' + id + '"]');
  const anyHidden = Array.from(rows).some(r => r.style.display === 'none');
  rows.forEach(r => r.style.display = anyHidden ? '' : 'none');
}}

// Restore tab from URL hash on load
(function() {{
  const hash = location.hash.slice(1);
  if (hash) {{
    const navEl = document.querySelector('.nav-item[data-tab="' + hash + '"]');
    if (navEl) switchTab(hash, navEl);
  }}
}})();
</script>
</body>
</html>'''
    return html


def main():
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    vitest = load_vitest()
    android = load_android_xml()
    cov = load_coverage()
    robot = load_robot_xml()
    scenarios = load_scenarios()
    history = load_history()
    metadata = load_metadata()
    if not metadata:
        metadata = build_default_metadata(vitest, android, robot)
        METADATA_JSON.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    if not vitest and not android and not robot:
        print("No test results found. Run 'pnpm test:report' first.")
        sys.exit(1)

    # Build scenario cross-reference
    scenario_results = build_scenario_results(scenarios, vitest, android, metadata) if scenarios else []

    # Compute stats for history
    vt_passed = vitest["numPassedTests"] if vitest else 0
    vt_failed = vitest["numFailedTests"] if vitest else 0
    vt_total = vitest["numTotalTests"] if vitest else 0
    and_passed = sum(s["passed"] for s in android)
    and_failed = sum(s["failures"] + s["errors"] for s in android)
    and_total = sum(s["tests"] for s in android)
    rob_passed = robot["passed"] if robot else 0
    rob_failed = robot["failed"] if robot else 0
    rob_total = robot["total"] if robot else 0
    total_passed = vt_passed + and_passed + rob_passed
    total_failed = vt_failed + and_failed + rob_failed
    total_all = vt_total + and_total + rob_total
    cov_total = cov.get("total", {}) if cov else {}
    lines_pct = cov_total.get("lines", {}).get("pct", 0)

    # Update history
    history = update_history(history, total_passed, total_failed, total_all, lines_pct, metadata)

    write_summary(metadata, total_passed, total_failed, total_all)
    html = generate_html(vitest, android, cov, scenarios, scenario_results, history, metadata, robot)
    OUTPUT_HTML.write_text(html, encoding="utf-8")
    print(f"HTML report: {OUTPUT_HTML}")


if __name__ == "__main__":
    main()
