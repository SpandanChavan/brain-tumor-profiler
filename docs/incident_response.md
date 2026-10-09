# Incident response: one page (SR-11)

**Trigger:** any suspicion that real patient data was uploaded, committed, logged or exposed.

1. **Contain (within 1 h):** take the public demo offline (pause the Space/app). Revoke shared links and tokens.
2. **Assess:** what data, how many people, where it went (logs, git history, screenshots, Kaggle outputs)? Keep notes with timestamps.
3. **Erase:**
   - Delete the data.
   - If it was committed to git, rewrite history (`git filter-repo`) **and** rotate any exposed secrets. Ask GitHub support to purge cached views.
4. **Notify:** tell the faculty guide the same day. Under HIPAA a covered entity notifies affected individuals within 60 days (and HHS/media if over 500 people). India's DPDP Act requires notifying the Data Protection Board and the affected people. For a student project, the guide and the institution decide on external notification.
5. **Learn:** within 1 week, write a blameless post-mortem. Update `risk_assessment.md`, add a test or hook that would have caught it, and redeploy.

Contacts: Project lead (privacy) Spandan Chavan · Faculty guide Prof. Jyoti Gavhane.
