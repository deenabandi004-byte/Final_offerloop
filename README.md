# Offerloop Studio (hosted viewer)

Read-only window onto the Studio Inbox in Notion: reels, their cut clips, feeling tags.
The clip finder itself runs on Rylan's Mac (~/clipfinder); this service only reads Notion.

Env: NOTION_TOKEN, NOTION_INBOX_DB, STUDIO_PASSWORD (basic auth, any user name), PORT (set by Render).
Deploy: Render web service, Python, start command `python studio_app.py`, custom domain studio.offerloop.ai.
The file studio_app.py is a copy of ~/clipfinder/studio_app.py; copy it over after any viewer change.
