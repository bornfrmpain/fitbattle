# Acceptance test: real listing photos through the whole app, in a real browser.
# Uses scripts/partner-stub.mjs as the AUTHORIZED listing source (Grailed itself offers
# none and forbids automated reads of its pages). Requires a production build and the
# app running with:
#   GRAILED_LISTING_LOOKUP_URL=https://localhost:4444/listings/{id}
#   IMAGE_FETCH_ALLOW_PRIVATE=1 NODE_TLS_REJECT_UNAUTHORIZED=0 (test only)
# Usage: python3 scripts/images_acceptance.py [BASE_URL] [SCREENSHOT_DIR]
import json, os, sys, urllib.request, ssl
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp"
PARTNER = "https://localhost:4444"
EXPECT = json.load(open("tests/fixtures/listings/expected-primary.json"))
RECORDS = json.load(open("tests/fixtures/listings/listings.json"))
LISTINGS = [r["listing_url"].split("/listings/")[1].split("-")[0] for r in RECORDS]
passed = 0
def ok(cond, msg):
    global passed
    if not cond: print(f"✗ {msg}"); sys.exit(1)
    passed += 1; print(f"✓ {msg}")
def open_import(pg):
    pg.locator("#imp-url").wait_for(timeout=10000)  # the import bar is always visible

def wait_turn(ctx, bid, n):
    import time
    for _ in range(50):
        if ctx.request.get(BASE + f"/api/battles/{bid}").json()["battle"]["currentTurn"] >= n: return
        time.sleep(0.2)
    raise AssertionError("turn did not advance")

def partner(path, body):
    ctx = ssl._create_unverified_context()
    req = urllib.request.Request(PARTNER + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    urllib.request.urlopen(req, context=ctx).read()

# Which listing each turn uses: tops for round 1, bottoms round 2, shoes round 3, outerwear round 4.
by_sub = {r["subcategory"]: r["listing_url"].split("/listings/")[1].split("-")[0] for r in RECORDS}
plan = [by_sub["tshirts"], by_sub["knitwear"], by_sub["trousers"], by_sub["denim"], by_sub["boots"], by_sub["sneakers"], by_sub["bags"], by_sub["jewellery"]]
SLOT_OF = {"tshirts": "top", "knitwear": "top", "trousers": "bottoms", "denim": "bottoms", "boots": "footwear", "sneakers": "footwear", "bags": "misc", "jewellery": "misc"}
NOSRC = sys.argv[3] if len(sys.argv) > 3 else None
DIOR = "https://www.grailed.com/listings/106515727-dior-dior-homme-japan-kris-van-assche-dirty-washed-black-jeans"

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
partner("/__reset", {})  # clean stub state, independent of other suites
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1440, "height": 900}, ignore_https_errors=True)
    pg = ctx.new_page()
    ctx.request.post(BASE + "/api/auth/signup", data={"username": "photo_tester", "password": "correct-horse", "displayName": "Mara"})

    # Unknown listing → honest "not available" state, no invented photo
    r = ctx.request.post(BASE + "/api/products/resolve", data={"url": "https://www.grailed.com/listings/123456789-not-in-source"}).json()
    ok(r["status"] == "not_found" and "doesn't have this listing" in r["message"], "listing missing from the source is reported, not faked")

    # Regression: locking in straight from the API (no import/preview first) must still pick the real
    # main photo. Listing 9100004's source gives no sizes and lists a banner first.
    rb = ctx.request.post(BASE + "/api/battles", data={"config": {"mode": "solo", "timerSeconds": None, "slots": ["bottoms"]}}).json()["battle"]
    it = ctx.request.post(BASE + f"/api/battles/{rb['id']}/select", data={"expectedTurn": 0, "productId": f"feed:{by_sub['denim']}"}).json()["item"]
    ok(it["imageUrl"].endswith(EXPECT[by_sub["denim"]]) and not any("banner" in u for u in it["images"]), "direct lock-in (no preview) still skips the banner and picks the main photo")

    pg.goto(BASE + "/play")
    pg.locator("label", has_text="Same device").locator("input").check()
    pg.get_by_role("button", name="Start battle").click()
    pg.wait_for_url("**/battle/*"); bid = pg.url.split("/battle/")[1]

    # Turn 0 is Tops. A bottoms listing is recognized and refused for this round.
    open_import(pg)
    pg.fill("#imp-url", f"https://www.grailed.com/listings/{by_sub['trousers']}-test-fixture")
    pg.get_by_role("button", name="Import", exact=True).click()
    pg.locator("text=this round needs tops").wait_for(timeout=10000)
    pg.screenshot(path=f"{OUT}/ui_import_wrong_round.png")
    ok(pg.get_by_role("button", name="Lock in this piece").is_disabled(), "a bottoms listing can't be locked into the tops round")
    # The Dior URL against the connected source: valid format, listing not in the source
    pg.fill("#imp-url", DIOR); pg.get_by_role("button", name="Import", exact=True).click()
    pg.locator("text=Listing not available").wait_for(timeout=10000)
    ok(pg.locator("text=✓ Valid Grailed listing link").count() == 1, "Dior URL with a source connected: format valid, listing reported unavailable")
    pg.reload(); pg.wait_for_timeout(1200)

    for turn, lid in enumerate(plan):
        open_import(pg)
        pg.fill("#imp-url", f"https://www.grailed.com/listings/{lid}-test-fixture")
        pg.get_by_role("button", name="Import", exact=True).click()
        main = pg.locator("text=Main photo").locator("xpath=..").locator("img").first
        main.wait_for(timeout=15000)
        pg.wait_for_function("(el) => el.complete && el.naturalWidth > 0", arg=main.element_handle(), timeout=10000)
        src = main.get_attribute("src")
        pg.wait_for_function("(el) => getComputedStyle(el).opacity === '1'", arg=main.element_handle(), timeout=5000)
        ok(src.endswith(EXPECT[lid]), f"turn {turn}: preview shows the best photo of listing {lid} ({EXPECT[lid]})")
        if turn == 3:
            pg.screenshot(path=f"{OUT}/ui_import_preview.png")
        pg.get_by_role("button", name="Lock in this piece").click()
        if turn < 7:
            wait_turn(ctx, bid, turn + 1)
            if turn == 2: pg.wait_for_timeout(800); pg.screenshot(path=f"{OUT}/ui_battle.png")
        else:
            pg.get_by_role("heading", name="both fits are in").wait_for(timeout=10000)
        if turn < 7:
            side = pg.locator(f"aside img[src$='{EXPECT[lid]}']").first
            side.wait_for(timeout=5000)
            pg.wait_for_function("(el) => el.naturalWidth > 0 && getComputedStyle(el).opacity === '1'", arg=side.element_handle(), timeout=5000)
            ok(True, f"turn {turn}: locked piece keeps the same photo, visible, in the outfit slot")

    state = ctx.request.get(BASE + f"/api/battles/{bid}").json()["battle"]
    ok(state["status"] == "voting", "all four categories filled for both players")
    sub_of = {r["listing_url"].split("/listings/")[1].split("-")[0]: r["subcategory"] for r in RECORDS}
    ok(all(it["slot"] == SLOT_OF[sub_of[it["listingUrl"].split("/listings/")[1].split("-")[0]]] for it in state["items"]), "every imported piece is in its correct category")
    for it in state["items"]:
        lid = it["listingUrl"].split("/listings/")[1].split("-")[0]
        ok(it["imageUrl"].endswith(EXPECT[lid]) and it["images"][0] == it["imageUrl"] and len(it["images"]) >= 2, f"saved snapshot for {lid}: primary first, other listing photos kept")
        ok(not any("avatar" in u or "logo" in u or "banner" in u or "thumb" in u for u in it["images"]), f"saved snapshot for {lid}: no avatar/logo/banner/thumbnail")

    # Reveal after a full reload
    pg.goto(BASE + f"/battle/{bid}"); pg.wait_for_timeout(2500)
    imgs = pg.eval_on_selector_all("[data-item-art] img", "els => els.map(e => ({src: e.getAttribute('src'), w: e.naturalWidth, o: getComputedStyle(e).opacity}))")
    ok(len(imgs) == 8 and all(i["w"] > 0 and i["o"] == "1" for i in imgs), "reveal after refresh: all 8 photos loaded and visible")
    ok(sorted(os.path.basename(i["src"]) for i in imgs) == sorted(EXPECT.values()), "reveal: each garment shows its own correct photo")
    pg.screenshot(path=f"{OUT}/ui_reveal.png", full_page=True)

    # Inspector shows the listing's other photos
    pg.locator("[data-item-art]").first.click()
    ok(pg.locator("[aria-label='Listing photos'] button").count() >= 2, "item inspector lists the listing's photos")
    pg.wait_for_timeout(600); pg.screenshot(path=f"{OUT}/ui_inspect.png")
    pg.keyboard.press("Escape")

    # Fallback: the stored primary goes dead → next photo of the SAME listing
    tee = by_sub["tshirts"]
    partner("/__break", {"files": [EXPECT[tee]]})
    pg.reload(); pg.wait_for_timeout(2500)
    srcs = pg.eval_on_selector_all("[data-item-art] img", "els => els.filter(e => e.naturalWidth > 0 && getComputedStyle(e).opacity === '1').map(e => e.getAttribute('src'))")
    ok(any(s.endswith(f"{tee}-back.jpg") for s in srcs), "dead primary photo falls back to the listing's next photo")

    # Refresh: every stored URL dead, source re-issues new URLs → authorized refresh
    boots = by_sub["boots"]
    partner("/__break", {"files": [f"{boots}-side.jpg", f"{boots}-sole.jpg"]})
    partner("/__rotate", {"id": boots})
    pg.reload(); pg.wait_for_timeout(4000)
    srcs = pg.eval_on_selector_all("[data-item-art] img", "els => els.filter(e => e.naturalWidth > 0).map(e => e.getAttribute('src'))")
    ok(any(s.endswith(f"/img2/{boots}-side.jpg") for s in srcs), "all photos dead → refreshed from the source, same listing, same chosen photo")
    item = [i for i in ctx.request.get(BASE + f"/api/battles/{bid}").json()["battle"]["items"] if boots in i["listingUrl"]][0]
    ok("/img2/" in item["imageUrl"], "refreshed photo URL saved to the outfit, survives reloads")

    # Dead with no refresh possible → clear error state, never a silhouette
    partner("/__break", {"files": [f"{tee}-back.jpg", f"{tee}-tag.jpg"]})
    pg.reload(); pg.wait_for_timeout(3000)
    ok(pg.locator("text=Photo unavailable").count() >= 1, "unloadable photos show a clear error state")
    ok(pg.locator("[data-item-art] svg").count() == 0, "no generic garment illustrations for real listings")
    pg.screenshot(path=f"{OUT}/ui_photo_error.png", full_page=True)

    # Battle history uses the same saved photos
    pg.goto(BASE + "/outfits"); pg.wait_for_timeout(2000)
    hist = pg.eval_on_selector_all("main img", "els => els.filter(e => e.naturalWidth > 0 && getComputedStyle(e).opacity === '1').map(e => e.getAttribute('src'))")
    ok(sum(1 for s in hist if "/img" in s) >= 2, "battle history shows the saved listing photos")
    br.close()

if NOSRC:
    # ---- Second app instance with NO data source: the real situation without a Grailed integration.
    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(viewport={"width": 1440, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
        pg = ctx.new_page()
        ctx.request.post(NOSRC + "/api/auth/signup", data={"username": "nosource", "password": "correct-horse", "displayName": "Mara"})
        pg.goto(NOSRC + "/play")
        pg.locator("label", has_text="Same device").locator("input").check()
        pg.get_by_role("button", name="Start battle").click()
        pg.wait_for_url("**/battle/*"); bid = pg.url.split("/battle/")[1]
        pg.locator("text=no items yet").wait_for(timeout=10000)
        ok(pg.locator("main article").count() == 0, "no source: no fake products in the battle grid")
        ok(pg.locator("text=Paste a Grailed listing URL to add your first piece.").count() == 1, "no source: empty state invites pasting a listing URL")
        pg.screenshot(path=f"{OUT}/ui_empty_state.png")

        # Real Ctrl+V into a field that already holds text (this used to glue two URLs together)
        pg.fill("#imp-url", "https://www.grailed.com/listings/")
        pg.evaluate("(u) => navigator.clipboard.writeText(u)", DIOR)
        pg.focus("#imp-url"); pg.keyboard.press("Control+V")
        pg.locator("text=✓ Valid Grailed listing link").wait_for(timeout=10000)
        ok(pg.input_value("#imp-url") == DIOR, "pasting replaces the field instead of concatenating URLs")
        ok(pg.locator("text=This listing can't be imported yet").count() == 1, "Dior URL: format valid, retrieval honestly reports no authorized source")
        ok(pg.locator("#m-title, #m-price").count() == 0 and pg.get_by_role("button", name="Lock in this piece").count() == 0,
           "no manual price entry and nothing to lock in without verified data")
        pg.screenshot(path=f"{OUT}/ui_dior_no_source.png")
        r = ctx.request.post(NOSRC + f"/api/battles/{bid}/select", data={"expectedTurn": 0, "manual": {"listingUrl": DIOR, "title": "Dior jeans", "priceEur": "1"}})
        ok(r.status == 422 and r.json()["error"]["code"] == "verified_only", "server refuses hand-entered pieces and prices")

        pg.fill("#imp-url", DIOR + DIOR); pg.get_by_role("button", name="Import", exact=True).click()
        pg.locator("text=Paste one listing link at a time").wait_for(timeout=5000)
        ok(True, "two concatenated links are refused with a clear message")

        # Empty state in every category, for both players (advance by skipping)
        seen = set()
        while True:
            st = ctx.request.get(NOSRC + f"/api/battles/{bid}").json()["battle"]
            if st["status"] != "active": break
            t = st["turns"][st["currentTurn"]]
            pg.reload(); pg.locator("text=No items yet").wait_for(timeout=10000)
            ok(pg.locator("main article").count() == 0, f"turn {t['index']} ({t['slot']}, player {t['seat'] + 1}): empty state, no products")
            seen.add((t["seat"], t["slot"]))
            ctx.request.post(NOSRC + f"/api/battles/{bid}/skip", data={"expectedTurn": t["index"]})
        ok(len(seen) == 8, "empty state shown for every category and both players")
        st = ctx.request.get(NOSRC + f"/api/battles/{bid}").json()["battle"]
        ok(st["items"] == [], "no unverified piece entered the battle")
        br.close()
print(f"\n{passed} acceptance checks passed (authorized source = local partner stub)")
