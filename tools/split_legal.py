# Regenerates privacy.html, terms.html, refund-policy.html, contact.html from the sections of public/legal.html.
# Run after editing legal.html:  python3 tools/split_legal.py
import re
src = open("public/legal.html").read()
head = src[:src.index('<main class="doc">')]
foot = src[src.index("</main>"):].replace('href="#privacy"','href="/privacy.html"').replace('href="#terms"','href="/terms.html"').replace('href="#refunds"','href="/refund-policy.html"')
def sect(id_):
    m = re.search(r'<h2 id="%s">.*?(?=<h2 id=|</main>)' % id_, src, re.S); return m.group(0)
CONTACT = sect("contact")
pages = {
 "privacy.html": ("Privacy Policy", "Privacy Policy of Salaamify Group (PiousHalf): what personal data we process, why, and your rights.", sect("privacy")),
 "terms.html": ("Terms of Use", "Terms of Use of Salaamify Group (PiousHalf).", sect("terms") + sect("pricing")),
 "refund-policy.html": ("Refund and Cancellation Policy", "Refund and Cancellation Policy of Salaamify Group (PiousHalf).", sect("refunds")),
 "contact.html": ("Contact us", "Contact Salaamify Group (PiousHalf): business details, email and support.", CONTACT),
}
for fn, (title, desc, body) in pages.items():
    h = re.sub(r"<title>.*?</title>", f"<title>{title} | Salaamify Group</title>", head)
    h = re.sub(r'<meta name="description" content=".*?">', f'<meta name="description" content="{desc}">', h, count=1)
    h = re.sub(r'(rel="canonical" href=")[^"]*"', r'\1https://pioushalf.com/%s"' % fn, h)
    h = re.sub(r'(property="og:url" content=")[^"]*"', r'\1https://pioushalf.com/%s"' % fn, h)
    h = re.sub(r'(property="og:title" content=")[^"]*"', r'\1%s | Salaamify Group"' % title, h)
    h = re.sub(r'(property="og:description" content=")[^"]*"', r'\1%s"' % desc, h)
    body = re.sub(r"<h2 id=", "<h1 id=", body, count=1); body = re.sub(r"</h2>", "</h1>", body, count=1)
    page = h + '<main class="doc">\n<p class="meta">Last updated 19 November 2026 · <a href="/legal.html">All policies</a></p>\n' + body + "\n" + foot
    open("public/" + fn, "w").write(page)
print("ok")
