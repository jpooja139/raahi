# Raahi (राही) — the AI engineer for creators

Team GoldHunter · Google Cloud AI Builder Cup 2026.

Raahi understands what a creator is trying to do, picks the best way to do it,
guides them by voice (Hindi/English) on their own accounts, and checks each
step actually worked.

## Run

```bash
pip3 install --user -r requirements.txt
cp .env.example .env   # add your GEMINI_API_KEY and YOUTUBE_API_KEY
python3 -m uvicorn app.main:app --port 8000
# open http://localhost:8000
```
