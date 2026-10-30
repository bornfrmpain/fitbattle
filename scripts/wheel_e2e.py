# Wheel / Randomizer end-to-end test in a real browser.
# Usage: python3 scripts/wheel_e2e.py BASE_URL [SCREENSHOT_DIR]
import json, math, os, sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp"
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
passed = 0
def ok(cond, msg):
    global passed
    if not cond: print(f"✗ {msg}"); sys.exit(1)
    passed += 1; print(f"✓ {msg}")

def under_pointer(pg, scope="[data-testid=wheel]"):
    """Text of the segment physically under the pointer tip, read from the rendered page."""
    return pg.evaluate("""(sel) => {
      const svg = document.querySelector(sel); const b = svg.getBoundingClientRect();
      const x = b.left + b.width * 0.5, y = b.top + b.height * 0.105;   // just below the pointer tip, inside the ring
      const el = document.elementFromPoint(x, y);
      return el && el.tagName === "path" ? el.querySelector("title")?.textContent : null; }""", scope)

def math_index(pg):
    d = pg.eval_on_selector("[data-testid=wheel]", "e => ({r: +e.dataset.rotation, n: +e.dataset.entries, res: e.dataset.result})")
    s = 360 / d["n"]; a = (360 - (d["r"] % 360)) % 360
    return min(d["n"] - 1, math.floor(a / s)), int(d["res"]) if d["res"] != "" else None

def spin_and_check(pg, label, clicks=1):
    before = int(pg.get_attribute("[data-testid=wheel]", "data-spins"))
    pg.click("[data-testid=spin-button]")
    for _ in range(clicks - 1):  # extra clicks land while the wheel is spinning: on the (disabled) button and on the hub
        pg.click("[data-testid=spin-button]", force=True, no_wait_after=True)
        pg.click("[data-testid=wheel] [role=button]", no_wait_after=True)
    pg.wait_for_function(f"() => +document.querySelector('[data-testid=wheel]').dataset.spins > {before} && document.querySelector('[data-testid=wheel]').dataset.spinning === 'false'", timeout=15000)
    after = int(pg.get_attribute("[data-testid=wheel]", "data-spins"))
    shown = pg.inner_text("[data-testid=wheel-result-text]")
    idx, res = math_index(pg)
    ok(after == before + 1, f"{label}: exactly one spin ran ({2 * clicks - 1} click{'s' if clicks > 1 else ''})")
    ok(idx == res and under_pointer(pg) == shown, f"{label}: result “{shown}” is the segment under the pointer")
    return shown

DIALOG = {"mode": "accept", "seen": []}
def accept_dialogs(pg):
    def h(d):
        DIALOG["seen"].append(d.message)
        d.dismiss() if DIALOG["mode"] == "dismiss" else d.accept()
    pg.on("dialog", h)

with sync_playwright() as p:
    br = p.chromium.launch()
    # ---------------- guest, fast spins (reduced motion = 1.2 s) ----------------
    ctx = br.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce", permissions=["clipboard-read", "clipboard-write"])
    pg = ctx.new_page(); accept_dialogs(pg)
    errors = []; pg.on("pageerror", lambda e: errors.append(str(e))); pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.goto(BASE + "/"); pg.get_by_role("navigation", name="Main").get_by_role("link", name="Wheel").click(); pg.wait_for_url("**/wheel")
    pg.wait_for_selector("[data-testid=wheel]")
    ok(pg.get_attribute("[data-testid=wheel]", "data-entries") == "6", "nav → Wheel opens the Price Wheel preset (6 entries)")
    spin_and_check(pg, "price wheel, rapid clicks", clicks=6)
    pg.locator("[data-testid=wheel] [role=button]").dblclick()
    pg.wait_for_timeout(1800)
    ok(pg.get_attribute("[data-testid=wheel]", "data-spins") == "2", "hub double-click also starts only one spin")
    for k in range(12): spin_and_check(pg, f"repeat spin {k + 1}")

    # ---------------- editor ----------------
    pg.get_by_role("button", name="New", exact=True).click()
    ok(pg.is_disabled("[data-testid=spin-button]"), "empty new wheel can't be spun")
    pg.fill("#wh-title", "Test 🔥 Wheel")
    pg.get_by_label("Entry 1", exact=True).fill("Rick Owens"); pg.get_by_label("Entry 2", exact=True).fill("€25")
    spin_and_check(pg, "exactly two entries")
    pg.fill("#wh-add", "Comme des Garçons"); pg.keyboard.press("Enter")
    pg.fill("#wh-add", "Rick Owens"); pg.get_by_role("button", name="Add", exact=True).click()
    pg.get_by_label("Entry 2", exact=True).fill("€ 25,00 💸")
    pg.get_by_role("button", name="Move entry 3 up").click()
    pg.get_by_role("button", name="Delete entry 1").click()
    vals = [pg.input_value(f"[aria-label='Entry {i}']") for i in range(1, 4)]
    ok(vals == ["Comme des Garçons", "€ 25,00 💸", "Rick Owens"], f"add, edit, reorder and delete work: {vals}")
    pg.get_by_label("Entry 1", exact=True).fill("   ")
    ok(pg.is_disabled("[data-testid=spin-button]") and pg.locator("text=Entry 1 is empty").count() >= 1, "an empty entry blocks spinning with a clear message")
    pg.get_by_label("Entry 1", exact=True).fill("Comme des Garçons")
    pg.get_by_role("button", name="Paste a list (one per line)").click()
    long = "L" * 61
    pg.fill("#wh-paste", "Balenciaga\n\nChrome Hearts\n" + long + "\nRick Owens\n🔥🔥🔥 Thrift energy with a very long label that still fits\n")
    pg.get_by_role("button", name="Add lines").click()
    ok(pg.locator("text=Added 4. Skipped 1 (1 too long)").count() == 1, "pasting lines adds valid ones and reports the overlong one")
    n = int(pg.get_attribute("[data-testid=wheel]", "data-entries"))
    ok(n == 7 and pg.locator("[data-testid=wheel] path title", has_text="Rick Owens").count() == 2, "duplicates stay as separate segments (7 segments, Rick Owens twice)")
    spin_and_check(pg, "duplicates, emoji, currency, long text")
    pg.screenshot(path=f"{OUT}/wheel_desktop.png")

    # 100-entry maximum
    pg.get_by_role("button", name="Clear", exact=True).click()
    pg.fill("#wh-paste", "\n".join(f"Entry {i}" for i in range(1, 106))); pg.get_by_role("button", name="Add lines").click()
    ok(pg.get_attribute("[data-testid=wheel]", "data-entries") == "100" and pg.locator("text=the wheel is full at 100").count() == 1, "pasting 105 lines stops at the 100-entry maximum")
    pg.fill("#wh-add", "one too many"); pg.get_by_role("button", name="Add", exact=True).click()
    ok(pg.locator("text=up to 100 entries").count() >= 1, "adding a 101st entry is refused")
    for k in range(3): spin_and_check(pg, f"100 entries, spin {k + 1}")
    pg.screenshot(path=f"{OUT}/wheel_100.png")

    # Save on device, refresh, duplicate, delete
    pg.fill("#wh-title", "Hundred"); pg.get_by_role("button", name="Save wheel").click()
    ok(pg.locator("text=Saved on this device only").count() >= 1, "guest save is clearly labeled device-only")
    pg.reload(); pg.wait_for_selector("[data-testid=wheel]")
    ok(pg.input_value("#wh-title") == "Hundred" and pg.get_attribute("[data-testid=wheel]", "data-entries") == "100", "refresh keeps the working wheel")
    saved = pg.locator("[aria-label='Saved wheels'] li")
    ok(saved.count() == 1, "saved wheel listed after refresh")
    saved.first.get_by_role("button", name="Duplicate").click(); pg.wait_for_timeout(300)
    ok(pg.locator("[aria-label='Saved wheels'] li").count() == 2 and pg.locator("text=Hundred (copy)").count() == 1, "duplicate a saved wheel")
    pg.locator("[aria-label='Saved wheels'] li", has_text="(copy)").get_by_role("button", name="Delete").click(); pg.wait_for_timeout(300)
    ok(pg.locator("[aria-label='Saved wheels'] li").count() == 1, "delete a saved wheel (with confirmation)")

    # Unsaved-change warning on mode switch
    pg.get_by_label("Entry 1", exact=True).fill("changed")
    DIALOG["mode"] = "dismiss"; DIALOG["seen"].clear()
    pg.get_by_role("tab", name="Brand Wheel").click(); pg.wait_for_timeout(300)
    ok(DIALOG["seen"] and "unsaved changes" in DIALOG["seen"][-1] and pg.input_value("[aria-label='Entry 1']") == "changed", "switching mode with unsaved changes warns, and cancel keeps the wheel")
    DIALOG["mode"] = "accept"
    pg.get_by_role("tab", name="Brand Wheel").click(); pg.wait_for_timeout(300)
    ok(pg.input_value("#wh-title") == "Pick a Brand", "confirming switches to the Brand Wheel preset")
    pg.get_by_role("tab", name="Custom Wheel").click(); pg.wait_for_timeout(300)
    ok(pg.input_value("#wh-title") == "Fashion Challenge", "Custom Wheel mode opens with an optional preset")

    # Share link round trip + tampered link + stream view
    pg.fill("#wh-title", "Shared ✨ wheel"); pg.get_by_role("button", name="Copy share link").click()
    url = pg.evaluate("() => navigator.clipboard.readText()")
    other = br.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="reduce").new_page()
    other.goto(url); other.wait_for_selector("[data-testid=wheel]")
    ok(other.input_value("#wh-title") == "Shared ✨ wheel" and other.locator("text=Loaded from a shared link").count() == 1, "share link opens the same wheel in another browser")
    other.goto(BASE + "/wheel?w=eyJ2IjoxLCJ0IjoiPGI+IiwiZSI6WyJhIl19")  # one entry → invalid
    ok(other.locator("text=Couldn't open the shared wheel").count() == 1, "invalid shared wheel is rejected with a message")
    stage = url.replace("/wheel?w=", "/wheel/stage?w=")
    other.goto(stage); other.wait_for_selector("[data-testid=wheel]")
    other.keyboard.press("Space")
    other.wait_for_function("() => document.querySelector('[data-testid=wheel]').dataset.spins === '1' && document.querySelector('[data-testid=wheel]').dataset.spinning === 'false'", timeout=15000)
    shown = other.inner_text("[data-testid=stage-result]")
    ok(under_pointer(other) == shown, f"stream view: Space spins, result “{shown}” matches the pointer")
    other.screenshot(path=f"{OUT}/wheel_stage.png")
    other.goto(BASE + "/wheel/stage?w=%%%"); ok(other.locator("[role=alert]", has_text="wheel link").count() == 1, "stream view with a broken link shows an error")
    ok(not errors, f"no page errors on the wheel page ({errors[:2]})")

    # ---------------- signed in: account storage + battle integration ----------------
    ctx2 = br.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    ctx2.request.post(BASE + "/api/auth/signup", data={"username": "wheeler", "password": "correct-horse", "displayName": "Mara"})
    pg2 = ctx2.new_page(); pg2.on("dialog", lambda d: d.accept(d.default_value + " v2") if d.type == "prompt" else d.accept())
    pg2.goto(BASE + "/wheel"); pg2.wait_for_selector("[data-testid=wheel]")
    pg2.get_by_role("button", name="Save wheel").click(); pg2.wait_for_timeout(500)
    ok(pg2.locator("text=Saved to your account").count() >= 1, "signed-in save goes to the account")
    api_list = ctx2.request.get(BASE + "/api/wheels").json()["wheels"]
    ok(len(api_list) == 1 and api_list[0]["title"] == "Random Budget", "wheel stored in the database")
    pg2.locator("[aria-label='Saved wheels'] li").first.get_by_role("button", name="Rename").click(); pg2.wait_for_timeout(500)
    ok(ctx2.request.get(BASE + "/api/wheels").json()["wheels"][0]["title"] == "Random Budget v2", "rename saved wheel")
    wid = api_list[0]["id"]
    ok(ctx2.request.put(BASE + f"/api/wheels/{wid}", data={"title": "x", "entries": ["only one"]}).status == 422, "server rejects an invalid wheel")
    stranger = br.new_context(); stranger.request.post(BASE + "/api/auth/signup", data={"username": "stranger", "password": "correct-horse"})
    ok(stranger.request.get(BASE + f"/api/wheels/{wid}").status == 404 and stranger.request.delete(BASE + f"/api/wheels/{wid}").status == 404, "other users can't read or delete it")
    pg2.goto(BASE + f"/wheel?id={wid}"); pg2.wait_for_selector("[data-testid=wheel]")
    ok(pg2.input_value("#wh-title") == "Random Budget v2", "load a saved wheel by link after refresh")

    # Apply a result to a battle as a challenge
    b = ctx2.request.post(BASE + "/api/battles", data={"config": {"mode": "local", "timerSeconds": 60, "budgetCents": 50000}, "localOpponentName": "Jun"}).json()["battle"]
    while True:
        shown = spin_and_check(pg2, "signed-in price spin")
        from re import match
        if match(r"^€\d+$", shown): break
    pg2.get_by_role("button", name="Use in FIT/DUEL").click()
    pg2.get_by_role("button", name="Add challenge").click()
    pg2.locator("text=Added as a challenge").wait_for(timeout=5000)
    view = ctx2.request.get(BASE + f"/api/battles/{b['id']}").json()["battle"]
    ok(len(view["challenges"]) == 1 and view["challenges"][0]["text"] == f"Random Budget v2: {shown}", "wheel result added to the battle as a challenge")
    bp = ctx2.new_page(); bp.goto(BASE + f"/battle/{b['id']}"); bp.wait_for_timeout(1500)
    ok(bp.locator("[aria-label=Challenges]", has_text=shown).count() == 1, "challenge visible on the battle screen")
    bp.goto(BASE + f"/battle/{b['id']}/stage"); bp.wait_for_timeout(1500)
    ok(bp.locator(f"text={shown}").count() >= 1, "challenge visible in the battle stream view")
    ok(view["config"]["budgetCents"] == 50000, "applying a result doesn't change the battle's rules")
    ok(stranger.request.post(BASE + f"/api/battles/{b['id']}/challenges", data={"text": "hack"}).status == 403, "non-players can't add challenges")
    # Use as budget for a new battle
    pg2.get_by_role("link", name=f"Budget of {shown}").click(); pg2.wait_for_url("**/play?budget=*")
    ok(pg2.locator("text=From the Wheel").count() == 1 and pg2.input_value("#cb") == shown.replace("€", ""), "“Budget of …” prefills the battle setup")
    pg2.locator("label", has_text="Same device").locator("input").check()
    pg2.get_by_role("button", name="Start battle").click(); pg2.wait_for_url("**/battle/*")
    nb = ctx2.request.get(BASE + "/api/battles/" + pg2.url.split("/battle/")[1]).json()["battle"]
    ok(nb["config"]["budgetCents"] == int(shown.replace("€", "")) * 100, "the new battle uses that budget, validated by the server")

    # Mobile layout
    m = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, reduced_motion="reduce").new_page()
    m.goto(BASE + "/wheel"); m.wait_for_selector("[data-testid=wheel]")
    wb = m.locator("[data-testid=wheel]").bounding_box(); eb = m.locator("[aria-label='Edit wheel']").bounding_box()
    ok(wb["width"] > 300 and eb["y"] > wb["y"] + wb["height"] - 1, "mobile: wheel first and full-width, editor below")
    m.click("[data-testid=spin-button]")
    m.wait_for_function("() => document.querySelector('[data-testid=wheel]').dataset.spins === '1'", timeout=15000)
    ok(under_pointer(m) == m.inner_text("[data-testid=wheel-result-text]"), "mobile: result matches the pointer")
    m.screenshot(path=f"{OUT}/wheel_mobile.png", full_page=False)

    # Full-length animation: smooth, eases out, ends exactly on the result
    full = br.new_context(viewport={"width": 1200, "height": 900}).new_page()
    full.goto(BASE + "/wheel"); full.wait_for_selector("[data-testid=wheel]")
    full.click("[data-testid=spin-button]")
    samples = []
    for _ in range(14):
        full.wait_for_timeout(400)
        t = full.eval_on_selector("[data-testid=wheel] > g", "g => g.getAttribute('transform')")
        samples.append(float(t.split("(")[1].split(" ")[0]))
    full.wait_for_function("() => document.querySelector('[data-testid=wheel]').dataset.spins === '1'", timeout=10000)
    steps = [b - a for a, b in zip(samples, samples[1:])]
    ok(all(s >= -1e-6 for s in steps) and steps[0] > steps[-1] and max(steps) > 100, f"5.4 s animation moves forward and decelerates (first step {steps[0]:.0f}°, last {steps[-1]:.1f}°)")
    ok(under_pointer(full) == full.inner_text("[data-testid=wheel-result-text]"), "full-length spin ends on the displayed result")
    br.close()
print(f"\n{passed} wheel checks passed")
