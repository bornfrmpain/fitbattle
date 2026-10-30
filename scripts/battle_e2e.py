# Two-player battle in two separate browsers (two accounts), end to end.
# Needs the app running with the partner stub as authorized source:
#   GRAILED_LISTING_LOOKUP_URL=https://localhost:4444/listings/{id} IMAGE_FETCH_ALLOW_PRIVATE=1 NODE_TLS_REJECT_UNAUTHORIZED=0
# Usage: python3 scripts/battle_e2e.py BASE_URL [SCREENSHOT_DIR]
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp"
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
EXPECT = json.load(open("tests/fixtures/listings/expected-primary.json"))
passed = 0
def ok(cond, msg):
    global passed
    if not cond: print(f"✗ {msg}"); sys.exit(1)
    passed += 1; print(f"✓ {msg}")
def wait_until(fn, timeout=8.0, step=0.2):
    end = time.time() + timeout
    while time.time() < end:
        if fn(): return True
        time.sleep(step)
    return False

import ssl, urllib.request
def partner(path, body):
    req = urllib.request.Request("https://localhost:4444" + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    urllib.request.urlopen(req, context=ssl._create_unverified_context()).read()

partner("/__reset", {})  # clean stub state, independent of other suites
with sync_playwright() as p:
    br = p.chromium.launch()
    H = br.new_context(viewport={"width": 1440, "height": 900}, ignore_https_errors=True)
    G = br.new_context(viewport={"width": 1280, "height": 900}, ignore_https_errors=True)
    X = br.new_context(ignore_https_errors=True)
    for c, u, n in [(H, "host_e2e", "Mara"), (G, "guest_e2e", "Jun"), (X, "third_e2e", "Kai")]:
        ok(c.request.post(BASE + "/api/auth/signup", data={"username": u, "password": "correct-horse", "displayName": n}).ok, f"sign up {n}")
    api = lambda c, path: c.request.get(BASE + path).json()
    hp, gp = H.new_page(), G.new_page()
    for pg in (hp, gp): pg.on("dialog", lambda d: d.accept())
    errors = []
    for pg in (hp, gp): pg.on("pageerror", lambda e: errors.append(str(e)))

    # --- create + join through the UI
    hp.goto(BASE + "/play")
    hp.locator("label", has_text="30 s").locator("input").check()
    hp.get_by_role("button", name="Create battle and get invite").click()
    hp.wait_for_url("**/battle/*"); bid = hp.url.split("/battle/")[1]
    code = hp.locator("p.font-display.num").first.inner_text().strip()
    ok(re.fullmatch(r"[A-Z2-9]{6}", code) is not None and api(H, f"/api/battles/{bid}")["battle"]["status"] == "waiting", f"host creates a battle and sees invite code {code}")
    ok(api(G, f"/api/battles/{bid}")["battle"]["invite"] is None, "the invite code is only shown to the host")
    gp.goto(BASE + "/join"); gp.fill("#code", "ZZZZZZ"); gp.get_by_role("button", name="Join battle").click()
    gp.locator("text=No battle uses that invite code").wait_for(timeout=5000); ok(True, "a wrong code is refused with a message")
    gp.fill("#code", code); gp.get_by_role("button", name="Join battle").click()
    gp.wait_for_url(f"**/battle/{bid}")
    st = api(G, f"/api/battles/{bid}")["battle"]
    ok(st["status"] == "active" and st["seats"][0]["name"] == "Mara" and st["seats"][1]["name"] == "Jun", "guest joins; seats: Mara = player 1, Jun = player 2")
    ok(X.request.post(BASE + "/api/join", data={"code": code}).status == 409, "a third account can't join a full battle")
    ok(H.request.post(BASE + "/api/join", data={"code": code}).ok and api(H, f"/api/battles/{bid}")["battle"]["seats"][1]["name"] == "Jun", "re-joining doesn't change the seats")
    ok(wait_until(lambda: hp.locator("text=Your pick").count() == 1, 6), "host's waiting room switches to the battle by itself")
    ok(gp.locator("text=Mara is choosing").count() == 1, "guest sees whose turn it is")
    ok([t["slot"] for t in st["turns"]] == ["top", "top", "bottoms", "bottoms", "footwear", "footwear", "misc", "misc"], "rounds run Tops → Bottoms → Shoes → Misc")

    # --- host imports and locks in; double click locks only once
    hp.fill("#imp-url", "https://www.grailed.com/listings/9100001-test-fixture"); hp.get_by_role("button", name="Import", exact=True).click()
    lock = hp.get_by_role("button", name="Lock in this piece"); lock.wait_for(timeout=10000)
    lock.dblclick()
    ok(wait_until(lambda: api(H, f"/api/battles/{bid}")["battle"]["currentTurn"] == 1), "host locks in a verified top")
    ok(len(api(H, f"/api/battles/{bid}")["battle"]["items"]) == 1, "double-clicking Lock in creates exactly one selection")
    ok(wait_until(lambda: gp.locator(f"aside img[src$='{EXPECT['9100001']}']").count() >= 1, 5), "guest's screen shows the host's piece with its real photo (no reload)")
    ok(wait_until(lambda: gp.locator("text=Your pick").count() == 1, 5), "guest's screen moves to their turn")

    # --- refresh does not restart the timer
    d0 = api(G, f"/api/battles/{bid}")["battle"]["turns"][1]["deadline"]
    secs = lambda pg: int(re.search(r"(\d+) seconds", pg.get_attribute("[role=timer]", "aria-label")).group(1))
    time.sleep(3); before = secs(gp); gp.reload(); gp.wait_for_selector("[role=timer]"); after = secs(gp)
    ok(api(G, f"/api/battles/{bid}")["battle"]["turns"][1]["deadline"] == d0 and after <= before, f"refresh keeps the server deadline ({before}s → {after}s, not back to 30)")
    ok(G.request.post(BASE + f"/api/battles/{bid}/select", data={"expectedTurn": 0, "productId": "feed:9100002"}).status == 409, "a stale turn number is refused")
    ok(H.request.post(BASE + f"/api/battles/{bid}/select", data={"expectedTurn": 1, "productId": "feed:9100002"}).status == 403, "the host can't pick on the guest's turn")
    ok(G.request.post(BASE + f"/api/battles/{bid}/select", data={"expectedTurn": 1, "productId": "feed:9100001"}).json()["error"]["code"] == "already_taken", "the same listing can't be locked twice")

    # --- guest leaves Tops empty; category tabs show both players' tops
    gp.get_by_role("button", name="Leave tops empty").click()
    ok(wait_until(lambda: api(G, f"/api/battles/{bid}")["battle"]["turns"][1]["status"] == "skipped"), "guest leaves Tops empty (with confirmation)")
    ok(G.request.post(BASE + f"/api/battles/{bid}/select", data={"expectedTurn": 1, "productId": "feed:9100002"}).status == 409, "a category that was left empty is locked")
    hp.get_by_role("button", name="Show tops picks").or_(hp.get_by_role("group", name="Categories").get_by_role("button").first).first.click()
    panel = hp.locator("[aria-label='Tops picks']"); panel.wait_for(timeout=5000)
    ok(wait_until(lambda: panel.locator("text=Left empty").count() == 1 and panel.locator("img").count() >= 1, 5), "Tops tab opens both players' tops: host's photo, guest left empty (synced within 5 s)")
    hp.screenshot(path=f"{OUT}/battle_tabs.png")
    panel.get_by_role("button", name="Close").click()

    # --- let the host's Bottoms turn run out for real (30 s)
    ok(wait_until(lambda: api(H, f"/api/battles/{bid}")["battle"]["currentTurn"] == 2, 5), "Bottoms round starts with the host")
    ok(wait_until(lambda: api(H, f"/api/battles/{bid}")["battle"]["turns"][2]["status"] == "expired", 36, 0.5), "host's Bottoms timer expires on the server")
    late = H.request.post(BASE + f"/api/battles/{bid}/select", data={"expectedTurn": 2, "productId": "feed:9100003"})
    ok(late.status == 409 and late.json()["error"]["code"] == "deadline_passed", "a pick after the deadline is refused")
    ok(wait_until(lambda: gp.locator("text=Your pick").count() == 1, 5), "both screens moved on to the guest's Bottoms turn")

    # --- guest picks bottoms in the UI; the rest through the API
    gp.fill("#imp-url", "https://www.grailed.com/listings/9100004-test-fixture"); gp.get_by_role("button", name="Import", exact=True).click()
    gp.get_by_role("button", name="Lock in this piece").click()
    ok(wait_until(lambda: api(G, f"/api/battles/{bid}")["battle"]["currentTurn"] == 4), "guest locks in verified bottoms")
    for c, t, pid in [(H, 4, "feed:9100005"), (G, 5, "feed:9100006"), (H, 6, "feed:9100007")]:
        ok(c.request.post(BASE + f"/api/battles/{bid}/select", data={"expectedTurn": t, "productId": pid}).ok, f"turn {t} locked")
    ok(G.request.post(BASE + f"/api/battles/{bid}/skip", data={"expectedTurn": 7}).ok, "guest leaves Miscellaneous empty")

    # --- reveal on both screens with matching totals
    st = api(H, f"/api/battles/{bid}")["battle"]
    ok(st["status"] == "voting", "battle complete, voting open")
    price = {i["listingUrl"].split("/listings/")[1].split("-")[0]: i["priceCents"] for i in st["items"]}
    exp0 = price["9100001"] + price["9100005"] + price["9100007"]; exp1 = price["9100004"] + price["9100006"]
    ok(st["spent"] == [exp0, exp1], f"totals from verified prices: €{exp0/100:.0f} and €{exp1/100:.0f}")
    for pg, who in [(hp, "host"), (gp, "guest")]:
        ok(wait_until(lambda: pg.locator("text=Both fits are in").count() == 1, 6), f"{who}'s screen shows the reveal")
        want = sorted(EXPECT[k] for k in ["9100001", "9100005", "9100007", "9100004", "9100006"])
        loaded = lambda: sorted(pg.eval_on_selector_all("[data-item-art] img", "els => els.filter(e => e.naturalWidth > 0).map(e => e.getAttribute('src').split('/').pop())"))
        ok(wait_until(lambda: loaded() == want, 6), f"{who}'s reveal shows all five real photos")
        ok(pg.locator(f"text=€{exp0/100:.0f} of €500").count() >= 1 and pg.locator(f"text=€{exp1/100:.0f} of €500").count() >= 1, f"{who}'s reveal shows both totals against the €500 budget")
    hp.screenshot(path=f"{OUT}/battle_reveal_two_players.png", full_page=True)
    ok(X.request.post(BASE + f"/api/battles/{bid}/vote", data={"seat": 0}).ok, "a judge votes")
    ok(H.request.post(BASE + f"/api/battles/{bid}/vote", data={"seat": 0}).status == 403, "players can't vote in their own battle")

    # --- history and invalid sessions
    hp.goto(BASE + "/outfits"); hp.wait_for_timeout(1500)
    ok(hp.locator(f"a[href='/battle/{bid}']").count() == 1 and hp.locator(f"main img[src$='{EXPECT['9100001']}']").count() >= 1, "battle history lists the battle with the host's real photos")
    r = hp.goto(BASE + "/battle/b_doesnotexist"); ok(r.status == 404 and hp.locator("text=Not found").count() >= 1, "an unknown battle shows a 404 page")
    ok(not errors, f"no page errors ({errors[:2]})")
    br.close()
print(f"\n{passed} battle checks passed")
