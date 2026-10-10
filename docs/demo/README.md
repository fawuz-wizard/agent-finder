# Demo kit

Everything someone needs to show Agent Finder on an Android phone without a laptop or a
server: the two APKs, QR codes that point at them, and a one-page script.

| File | What it is |
|---|---|
| `demo-kit.html` | The one page to print or send: three QR codes, install steps, what to show, what to say if asked |
| `release-notes.md` | The text the Android workflow puts on the `pilot-latest` GitHub Release |
| `qr-release-page.svg/.png` | QR → https://github.com/fawuz-wizard/agent-finder/releases/tag/pilot-latest |
| `qr-agent-finder-apk.svg/.png` | QR → the customer app, `agent-finder.apk` |
| `qr-agent-app-apk.svg/.png` | QR → the agent and aggregator app, `agent-app.apk` |

**How the link stays alive.** Every push to `main` that touches `apps/web` rebuilds both APKs
(`.github/workflows/android.yml`) and replaces the assets on the `pilot-latest` release, so a
QR code printed today downloads the newest build next month. With no `API_BASE_URL`
repository variable the build runs in mock mode: the demo network ships inside the APK and
the phone needs no connection after the download. Once the API is hosted, set the variable and
the same links serve live builds.

**Regenerating the QR codes.** The links never change, so this is only needed if the
repository moves. Any QR encoder will do; these were made with `segno`:

```sh
python -m pip install segno
python -c "import segno; segno.make('https://github.com/fawuz-wizard/agent-finder/releases/tag/pilot-latest', error='m').save('qr-release-page.svg', scale=6, border=2)"
```

**A PDF to send.** Open `demo-kit.html` in a browser and print to PDF, or:

```sh
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('file://'+process.cwd()+'/docs/demo/demo-kit.html');await p.pdf({path:'agent-finder-demo-kit.pdf',format:'A4',printBackground:true});await b.close()})()"
```
